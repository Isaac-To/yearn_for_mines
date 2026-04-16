import { McpClient } from '@yearn-for-mines/shared';
import { LlmClient, type LlmMessage, type ToolCall, type ToolDescription, type LlmResponse } from '@yearn-for-mines/shared';
import { MemoryManager, inferSkillRoom } from './memory-manager.js';

/**
 * Result of a single agent loop iteration.
 */
export interface AgentStep {
  /** What the agent observed */
  observation: string;
  /** Tool calls the agent decided to make */
  toolCalls: ToolCall[];
  /** Results from executing those tool calls */
  toolResults: Array<{ name: string; result: string; isError: boolean }>;
  /** Whether the agent believes it has achieved its goal */
  goalAchieved: boolean;
  /** Number of retries used this step */
  retriesUsed: number;
}

/**
 * Configuration for the agent loop.
 */
export interface AgentLoopConfig {
  /** The goal the agent is trying to achieve */
  goal: string;
  /** Maximum number of loop iterations */
  maxIterations: number;
  /** Maximum retries per tool call before trying alternative */
  maxRetries: number;
  /** Maximum observation tokens (for truncation) */
  maxObservationTokens: number;
  /** Whether to enable VLM screenshots */
  enableVlm: boolean;
  /** Delay between loop iterations in ms */
  loopDelayMs: number;
  /** Optional AbortSignal to cancel the loop */
  signal?: AbortSignal;
}

export const DEFAULT_AGENT_CONFIG: AgentLoopConfig = {
  goal: '',
  maxIterations: 100,
  maxRetries: 3,
  maxObservationTokens: 2000,
  enableVlm: false,
  loopDelayMs: 500,
};

/**
 * The agent controller orchestrating perceive-plan-execute-verify-remember.
 */
export class AgentLoop {
  private mcClient: McpClient;
  private memoryManager: MemoryManager | null;
  private llmClient: LlmClient;
  private config: AgentLoopConfig;
  private conversationHistory: LlmMessage[] = [];
  private running = false;
  private iteration = 0;
  private tools: ToolDescription[] = [];
  private onStep?: (step: AgentStep) => void;
  private abortSignal?: AbortSignal;
  private internalAbortController?: AbortController;

  constructor(
    mcClient: McpClient,
    llmClient: LlmClient,
    config: Partial<AgentLoopConfig> & { goal: string },
    mempalaceClient?: McpClient,
  ) {
    this.mcClient = mcClient;
    this.memoryManager = mempalaceClient ? new MemoryManager(mempalaceClient) : null;
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.abortSignal = config.signal;
  }

  /**
   * Set a callback to receive step updates.
   */
  setStepCallback(cb: (step: AgentStep) => void): void {
    this.onStep = cb;
  }

  /** Throw if the abort signal has been triggered. */
  private throwIfAborted(): void {
    if (this.abortSignal?.aborted) {
      throw new DOMException('Agent loop aborted', 'AbortError');
    }
  }

  /** Create a delay that resolves immediately if aborted. */
  private abortableDelay(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Agent loop aborted', 'AbortError'));
      };
      this.abortSignal?.addEventListener('abort', onAbort, { once: true });
      const cleanResolve = () => {
        this.abortSignal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const timer = setTimeout(cleanResolve, ms);
    });
  }

  /** Wrap a promise so it rejects on abort. */
  private abortable<T>(promise: Promise<T> | T): Promise<T> {
    const wrapped = Promise.resolve(promise);
    const signal = this.abortSignal;
    if (!signal) return wrapped;
    if (signal.aborted) return Promise.reject(new DOMException('Agent loop aborted', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Agent loop aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      wrapped.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }

  /**
   * Run the agent loop until the goal is achieved or max iterations reached.
   */
  async run(): Promise<AgentStep[]> {
    this.running = true;
    this.iteration = 0;
    this.conversationHistory = [];
    const steps: AgentStep[] = [];

    // If no external signal was provided, create an internal one so stop() can abort
    if (!this.abortSignal) {
      this.internalAbortController = new AbortController();
      this.abortSignal = this.internalAbortController.signal;
    }

    try {
      // Discover available tools
      await this.abortable(this.discoverTools());

      // Retrieve relevant memories
      const memoryContext = await this.abortable(this.retrieveMemories());

      // Build system prompt
      const systemPrompt = this.llmClient.formatSystemPrompt(
        this.config.goal,
        this.tools,
        memoryContext,
      );

      this.conversationHistory.push({ role: 'system', content: systemPrompt });

      while (this.running && this.iteration < this.config.maxIterations) {
        this.throwIfAborted();
        this.iteration++;

        // PERCEIVE
        const observation = await this.perceive();

        // PLAN
        const toolCalls = await this.plan(observation);

        if (toolCalls.length === 0) {
          // No tool calls — agent might think it's done
          const step: AgentStep = {
            observation,
            toolCalls: [],
            toolResults: [],
            goalAchieved: true,
            retriesUsed: 0,
          };
          steps.push(step);
          this.onStep?.(step);
          break;
        }

        // EXECUTE with retry
        const { results, retriesUsed } = await this.executeWithRetry(toolCalls);

        // VERIFY
        const goalAchieved = await this.verify(results);

        // Build step result
        const step: AgentStep = {
          observation,
          toolCalls,
          toolResults: results,
          goalAchieved,
          retriesUsed,
        };
        steps.push(step);
        this.onStep?.(step);

        // REMEMBER
        if (goalAchieved) {
          await this.rememberSuccess(toolCalls);
          break;
        }

        // Delay between iterations
        if (this.config.loopDelayMs > 0) {
          await this.abortableDelay(this.config.loopDelayMs);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Graceful abort — return whatever steps were completed
        console.log('[AgentLoop] Aborted');
      } else {
        throw err;
      }
    }

    this.running = false;
    return steps;
  }

  /**
   * Stop the agent loop.
   */
  stop(): void {
    this.running = false;
    if (this.internalAbortController) {
      this.internalAbortController.abort();
    }
  }

  /** Current iteration number */
  get currentIteration(): number {
    return this.iteration;
  }

  /** Whether the loop is running */
  get isRunning(): boolean {
    return this.running;
  }

  // ─── PERCEIVE ────────────────────────────────────────────

  private async perceive(): Promise<string> {
    this.throwIfAborted();
    // Call the observe tool to get current world state
    const obsResult = await this.abortable(this.mcClient.callTool('observe', {}));
    const observationText = this.extractText(obsResult);

    // Get recent events
    const eventsResult = await this.abortable(this.mcClient.callTool('get_events', {}));
    const eventsText = this.extractText(eventsResult);

    // Combine observation and events
    let fullObservation = observationText;
    if (eventsText && eventsText !== 'No events subscribed') {
      fullObservation += `\n\nRecent Events:\n${eventsText}`;
    }

    // Optionally capture screenshot
    if (this.config.enableVlm) {
      await this.abortable(this.mcClient.callTool('screenshot', {}));
      // Screenshot will be handled in plan() when constructing messages
    }

    return fullObservation;
  }

  // ─── PLAN ────────────────────────────────────────────────

  private async plan(observation: string): Promise<ToolCall[]> {
    this.throwIfAborted();
    // Add observation as user message
    this.conversationHistory.push({
      role: 'user',
      content: observation,
    });

    try {
      const response = await this.abortable(this.llmClient.chat(
        this.conversationHistory,
        this.tools,
      ));

      const toolCalls = this.llmClient.parseToolCalls(response as unknown as LlmResponse);

      // Add assistant message to conversation
      const assistantContent = (response as unknown as LlmResponse).choices?.[0]?.message?.content;
      if (assistantContent || toolCalls.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: assistantContent ?? `Calling tools: ${toolCalls.map(t => t.name).join(', ')}`,
        });
      }

      return toolCalls;
    } catch (error) {
      // LLM call failed — add error to conversation
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.conversationHistory.push({
        role: 'assistant',
        content: `Error planning: ${errorMsg}`,
      });
      return [];
    }
  }

  // ─── EXECUTE ─────────────────────────────────────────────

  private async executeWithRetry(toolCalls: ToolCall[]): Promise<{
    results: Array<{ name: string; result: string; isError: boolean }>;
    retriesUsed: number;
  }> {
    const results: Array<{ name: string; result: string; isError: boolean }> = [];
    let retriesUsed = 0;

    for (const call of toolCalls) {
      let result = await this.executeToolCall(call);
      let retryCount = 0;

      while (result.isError && retryCount < this.config.maxRetries) {
        retryCount++;
        retriesUsed++;

        // Add error feedback to conversation
        this.conversationHistory.push({
          role: 'tool',
          content: `Error (${retryCount}/${this.config.maxRetries}): ${result.result}. Trying again...`,
          tool_call_id: call.id,
        });

        // Try alternative approach on last retry
        if (retryCount === this.config.maxRetries) {
          const altResult = await this.tryAlternative(call);
          if (altResult) {
            result = altResult;
            break;
          }
        }

        // Retry the same tool call
        result = await this.executeToolCall(call);
      }

      // Add tool result to conversation
      this.conversationHistory.push({
        role: 'tool',
        content: result.result,
        tool_call_id: call.id,
      });

      results.push(result);
    }

    return { results, retriesUsed };
  }

  private async executeToolCall(call: ToolCall): Promise<{ name: string; result: string; isError: boolean }> {
    this.throwIfAborted();
    // Route to appropriate MCP server
    const isMemPalaceTool = call.name.startsWith('mempalace_');
    const client = isMemPalaceTool && this.memoryManager?.isConnected
      ? this.memoryManager.getClient()
      : this.mcClient;

    try {
      const result = await this.abortable(client.callTool(call.name, call.args));
      const text = this.extractText(result);
      return { name: call.name, result: text, isError: result.isError };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { name: call.name, result: `Tool execution failed: ${msg}`, isError: true };
    }
  }

  private async tryAlternative(originalCall: ToolCall): Promise<{ name: string; result: string; isError: boolean } | null> {
    // Ask LLM for an alternative approach
    this.conversationHistory.push({
      role: 'user',
      content: `The tool ${originalCall.name} has failed ${this.config.maxRetries} times. Suggest an alternative approach using different tools.`,
    });

    try {
      const response = await this.abortable(this.llmClient.chat(
        this.conversationHistory,
        this.tools,
      ));
      const altCalls = this.llmClient.parseToolCalls(response as unknown as LlmResponse);

      if (altCalls.length > 0 && altCalls[0].name !== originalCall.name) {
        return await this.executeToolCall(altCalls[0]);
      }
    } catch {
      // Alternative also failed
    }

    return null;
  }

  // ─── VERIFY ──────────────────────────────────────────────

  private async verify(results: Array<{ name: string; result: string; isError: boolean }>): Promise<boolean> {
    this.throwIfAborted();
    // Check if any tool explicitly reported success
    const hasSuccess = results.some(r => !r.isError && r.result.toLowerCase().includes('success'));
    const hasFailure = results.some(r => r.isError);

    if (hasSuccess && !hasFailure) {
      return true;
    }

    // Re-observe world state
    let newObservation = '';
    try {
      const newObsResult = await this.abortable(this.mcClient.callTool('observe', {}));
      newObservation = this.extractText(newObsResult);
    } catch {
      // Observation failed
    }

    // Ask LLM to verify if goal is achieved based on new observation
    this.conversationHistory.push({
      role: 'user',
      content: `After your actions, the world state is now:\n${newObservation}\n\nHave you achieved the goal: "${this.config.goal}"? If yes, respond without tool calls. If no, continue with tool calls.`,
    });

    try {
      const response = await this.abortable(this.llmClient.chat(this.conversationHistory, this.tools));
      const toolCalls = this.llmClient.parseToolCalls(response as unknown as LlmResponse);
      // If LLM responds without tool calls, it thinks the goal is achieved
      return toolCalls.length === 0;
    } catch {
      return false;
    }
  }

  // ─── REMEMBER ────────────────────────────────────────────

  private async rememberSuccess(toolCalls: ToolCall[]): Promise<void> {
    if (!this.memoryManager) return;
    const room = inferSkillRoom(this.config.goal);
    await this.abortable(this.memoryManager.storeSkill(this.config.goal, toolCalls, room));
    await this.abortable(this.memoryManager.writeMilestone(this.config.goal, 'Goal achieved successfully'));
  }

  private async retrieveMemories(): Promise<string | undefined> {
    if (!this.memoryManager) return undefined;
    return await this.abortable(this.memoryManager.retrieveSkills(this.config.goal));
  }

  // ─── UTILITIES ───────────────────────────────────────────

  private async discoverTools(): Promise<void> {
    const mcTools = await this.abortable(this.mcClient.listTools());
    this.tools = mcTools.map(t => ({
      name: t.name,
      description: t.description ?? '',
    }));

    if (this.memoryManager?.isConnected) {
      const memTools = await this.abortable(this.memoryManager.getClient().listTools());
      this.tools.push(...memTools.map(t => ({
        name: t.name,
        description: t.description ?? '',
      })));
    }
  }

  private extractText(result: { content: Array<{ type: string; text?: string }> } | null | undefined): string {
    if (!result?.content) return '';
    return result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }
}