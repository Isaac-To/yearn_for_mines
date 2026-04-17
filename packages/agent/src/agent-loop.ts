import { McpClient } from '@yearn-for-mines/shared';
import { LlmClient, type LlmMessage, type ToolCall, type ToolDescription, type LlmResponse } from '@yearn-for-mines/shared';
import { MemoryManager, inferSkillRoom } from './memory-manager.js';

/** Agent connection state machine states. */
export type AgentState = 'connecting' | 'connected' | 'running' | 'paused';

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
  private state: AgentState = 'connected';
  private tools: ToolDescription[] = [];
  private onStep?: (step: AgentStep) => void;
  private abortSignal?: AbortSignal;
  private internalAbortController?: AbortController;

  /** Polling interval (ms) when in paused state, checking bot_status. */
  private pausePollIntervalMs = 3000;

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

      this.state = 'running';
      while (this.running && this.iteration < this.config.maxIterations) {
        this.throwIfAborted();
        this.iteration++;
        console.log(`[AgentLoop] Iteration ${this.iteration} started`);

        // PERCEIVE
        console.log('[AgentLoop] Perceiving world state...');
        const observation = await this.perceive();
        console.log('[AgentLoop] Perceived observation (length: ' + observation.length + ')');

        // PLAN
        console.log('[AgentLoop] Planning next actions...');
        const toolCalls = await this.plan(observation);
        console.log(`[AgentLoop] Planned ${toolCalls.length} tool calls`);

        if (toolCalls.length === 0) {
          // No tool calls — verify whether the goal is actually complete.
          const goalAchieved = await this.verify([]);
          const step: AgentStep = {
            observation,
            toolCalls: [],
            toolResults: [],
            goalAchieved,
            retriesUsed: 0,
          };
          steps.push(step);
          this.onStep?.(step);

          if (goalAchieved) {
            break;
          }

          this.conversationHistory.push({
            role: 'user',
            content: 'You did not use any tools and the goal is not yet achieved. You MUST output a tool call using the appropriate JSON schema format to continue.'
          });

          continue;
        }

        // EXECUTE with retry
        const { results, retriesUsed, disconnected, reconnected } = await this.executeWithRetry(toolCalls);

        // If disconnected during execution, inject context and re-observe
        if (disconnected) {
          this.conversationHistory.push({
            role: 'user',
            content: 'The bot was disconnected and has not been able to reconnect. Re-observing the world state.',
          });
          continue;
        }

        // If reconnected during execution, inject context about what happened
        if (reconnected) {
          this.conversationHistory.push({
            role: 'user',
            content: 'The bot was temporarily disconnected but has now reconnected. Re-observing the world state to continue working toward the goal.',
          });
        }

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

  /** Current connection state of the agent. */
  get currentState(): AgentState {
    return this.state;
  }

  /** Check if a tool result indicates a transient (connection-related) error. */
  private isTransientError(result: { name: string; result: string; isError: boolean }): boolean {
    if (!result.isError) return false;
    const msg = result.result.toLowerCase();
    return msg.includes('[transient]') ||
      msg.includes('bot is not connected') ||
      msg.includes('mcp transport error') ||
      msg.includes('mcp client not connected') ||
      msg.includes('connection refused') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout');
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
    
    const charLimit = this.config.maxObservationTokens * 4;
    if (fullObservation.length > charLimit) {
      fullObservation = fullObservation.slice(0, charLimit) + '\n\n...[Observation truncated due to length]';
    }

    return fullObservation;
  }

  // ─── PLAN ────────────────────────────────────────────────

  private async plan(observation: string): Promise<ToolCall[]> {
    this.throwIfAborted();
    // Add observation as user message
    this.conversationHistory.push({
      role: 'user',
      content: `Current World State Observation:\n${observation}\n\nReminder: Your current goal is to: ${this.config.goal}\nBased on these observations, please output a tool call to perform your next step to progress towards the goal. You are an autonomous agent, do not ask me what you should do next.`,
    });

    try {
      const response = await this.abortable(this.llmClient.chat(
        this.conversationHistory,
        this.tools,
      ));

      console.log('[AgentLoop] Received plan response from LLM');
      // For some local models, parseToolCalls might look at response, but choices[0] could be missing
      const llmResponse = response as unknown as LlmResponse;
      const message = llmResponse?.choices?.[0]?.message;
      
      if (message?.content) {
        console.log(`[AgentLoop] LLM Thought: ${message.content}`);
      }

      const toolCalls = this.llmClient.parseToolCalls(llmResponse);

      // Preserve the assistant turn in the same structure the API returned.
      if (message?.content !== undefined || toolCalls.length > 0) {
        const assistantMessage: LlmMessage = { role: 'assistant' };
        if (message?.content !== undefined && message.content !== null) {
          assistantMessage.content = message.content;
        }
        if (message?.tool_calls?.length) {
          assistantMessage.tool_calls = message.tool_calls.map((call) => ({
            id: call.id,
            type: call.type ?? 'function',
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          }));
        }
        this.conversationHistory.push(assistantMessage);
      }

      return toolCalls;
    } catch (error) {
      // LLM call failed — add error to conversation
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[AgentLoop] LLM error planning: ${errorMsg}`);
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
    disconnected: boolean;
    reconnected: boolean;
  }> {
    const results: Array<{ name: string; result: string; isError: boolean }> = [];
    let retriesUsed = 0;
    let reconnected = false;

    for (const call of toolCalls) {
      let result = await this.executeToolCall(call);

      // Check for transient (connection) errors — enter paused state
      if (this.isTransientError(result)) {
        console.warn(`[Agent] Transient error in ${result.name}: ${result.result}`);
        console.log('[Agent] Entering paused state due to connection issue...');
        await this.handleDisconnection();
        // Re-execute the tool after reconnection
        result = await this.executeToolCall(call);
        if (this.isTransientError(result)) {
          // Still failing after reconnection attempt — report error and continue
          results.push(result);
          this.conversationHistory.push({ role: 'tool', content: result.result, tool_call_id: call.id });
          return { results, retriesUsed, disconnected: true, reconnected };
        }
        reconnected = true;
      }

      let retryCount = 0;

      while (result.isError && retryCount < this.config.maxRetries) {
        // Skip retries for transient errors (handled above)
        if (this.isTransientError(result)) break;

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

    return { results, retriesUsed, disconnected: false, reconnected };
  }

  /**
   * Handle disconnection by pausing the loop and polling bot_status until reconnected.
   * Resumes the loop after reconnection is confirmed.
   */
  private async handleDisconnection(): Promise<void> {
    this.state = 'paused';
    console.log('[Agent] Paused due to disconnection. Polling bot_status for reconnection...');

    while (this.running && !this.abortSignal?.aborted) {
      try {
        const statusResult = await this.mcClient.callTool('bot_status', {});
        const statusText = this.extractText(statusResult);
        const status = JSON.parse(statusText);

        if (status.connected) {
          console.log('[Agent] Bot reconnected! Resuming loop...');
          this.state = 'running';
          return;
        }
      } catch {
        // MCP server might also be unreachable
      }

      // Count this poll as an iteration
      this.iteration++;
      if (this.iteration >= this.config.maxIterations) {
        console.log('[Agent] Iteration budget exhausted while paused');
        this.running = false;
        return;
      }

      await this.abortableDelay(this.pausePollIntervalMs);
    }

    // Aborted while paused
    this.state = 'connected';
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
      const msg = (response as unknown as LlmResponse)?.choices?.[0]?.message?.content;
      console.log(`[AgentLoop] Verification LLM Thought: ${msg || '<none>'}`);
      console.log(`[AgentLoop] Verification Tool Calls: ${toolCalls.length}`);
      
      if (toolCalls.length > 0) {
        return false;
      }
      
      const containsYes = msg?.toLowerCase().includes('yes');
      return containsYes ?? false;
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
      inputSchema: t.inputSchema,
    }));

    if (this.memoryManager?.isConnected) {
      const memTools = await this.abortable(this.memoryManager.getClient().listTools());
      this.tools.push(...memTools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
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