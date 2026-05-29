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
  /** Whether to narrate actions in Minecraft chat */
  enableChatNarration: boolean;
  /** Whether to respond to player chat messages */
  enableChatResponse: boolean;
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
  enableChatNarration: true,
  enableChatResponse: true,
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
  private currentContextFrame: string | null = null;
  private actionHistory: Array<{ toolCalls: any[], toolResults: Array<{ name: string; result: string; isError: boolean }> }> = [];
  private toolsDiscovered = false;
  private lastObservation = '';
  private readonly maxHistoryIterations = 10; // Keep only last 10 iterations in context
  private readonly maxResultLength = 500; // Truncate large tool results
  private transientErrorPatterns = /\[transient\]|bot is not connected|mcp transport error|mcp client not connected|connection refused|econnrefused|timeout/i;

  private lastChatTimeMs = 0;
  private minChatIntervalMs = 2000;

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

  /** Prune old conversation history to keep context window reasonable */
  private pruneConversationHistory(): void {
    // Keep system message + last N iterations worth of messages
    const systemMsg = this.conversationHistory[0];
    if (!systemMsg || systemMsg.role !== 'system') return;

    const nonSystemMsgs = this.conversationHistory.slice(1);
    // Each iteration ~4 messages (user, assistant, tool, user). Keep last N iterations
    const msgsToKeep = this.maxHistoryIterations * 4;

    // Only prune if significantly over limit (avoid constant pruning overhead)
    if (nonSystemMsgs.length > msgsToKeep + 5) {
      const pruned = [systemMsg, ...nonSystemMsgs.slice(-(msgsToKeep))];
      this.conversationHistory = pruned;
      console.log(`[AgentLoop] Pruned history to ${pruned.length} messages`);
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
      // Discover available tools (cached after first discovery)
      if (!this.toolsDiscovered) {
        await this.abortable(this.discoverTools());
        this.toolsDiscovered = true;
      }

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
      await this.sendChat(`Starting: ${this.config.goal}`);
      while (this.running && this.iteration < this.config.maxIterations) {
        this.throwIfAborted();
        this.iteration++;
        console.log(`[AgentLoop] Iteration ${this.iteration} started`);

        // PERCEIVE (optimize: only observe if not already observed)
        console.log('[AgentLoop] Perceiving world state...');
        let observation = this.lastObservation;
        try {
          const statusPromise = this.abortable(this.mcClient.callTool("bot_status", {}));
          const statusTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('bot_status timed out')), 20_000)
          );
          const newObservation = this.extractText(await Promise.race([statusPromise, statusTimeout]));

          try {
            const statusObj = JSON.parse(newObservation);
            if (statusObj.connected === false) {
              throw new Error("Bot disconnected from server");
            }
          } catch (e: any) {
            if (e.message === "Bot disconnected from server") throw e;
          }

          if (!observation || newObservation !== observation) {
            observation = newObservation;
            this.lastObservation = observation;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[AgentLoop] Perception failed: ${msg}`);
          // Trigger reconnection flow instead of silently continuing
          if (this.transientErrorPatterns.test(msg) || msg.includes('timed out') || msg.includes('disconnected')) {
            await this.handleDisconnection();
            continue; // re-perceive after reconnect
          }
          observation = observation || "err";
        }

        // PLAN
        console.log('[AgentLoop] Planning next actions...');
        const toolCalls = await this.plan(observation);
        console.log(`[AgentLoop] Planned ${toolCalls.length} tool calls`);

        if (toolCalls.length === 0) {
          // No tool calls — verify whether the goal is actually complete.
          const goalAchieved = await this.verify([], true);
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
            await this.sendChat(`Goal achieved: ${this.config.goal}`);
            break;
          }

          this.conversationHistory.push({
            role: 'user',
            content: `You claimed the goal is complete (or output no tools) but verification shows it is NOT. ` +
              `Current world state: ${observation}. ` +
              `You MUST use tools to actually accomplish: "${this.config.goal}". ` +
              `Do not claim completion again until verification confirms it. ` +
              `You MUST output a tool call using the appropriate JSON schema format to continue.`
          });

          continue;
        }

        // EXECUTE with retry
        const { results, retriesUsed, disconnected, reconnected } = await this.executeWithRetry(toolCalls);

          this.actionHistory.push({ toolCalls, toolResults: results });

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

        // REFLECT & REMEMBER
        if (goalAchieved) {
          await this.sendChat(`Goal achieved: ${this.config.goal}`);
          await this.reflectAndRemember(
            true,
            steps.flatMap(s => s.toolCalls),
            steps.flatMap(s => s.toolResults)
          );
          break;
        }

        // Delay between iterations
        if (this.config.loopDelayMs > 0) {
          await this.abortableDelay(this.config.loopDelayMs);
        }

        // Keepalive ping every iteration to prevent socket timeout
        if (this.iteration % 3 === 0) {
          try {
            await Promise.race([
              this.mcClient.callTool('bot_status', {}),
              new Promise<void>(resolve => setTimeout(resolve, 2000))
            ]);
          } catch { /* ignore keepalive failures */ }
        }
      }

      // If we exited the loop by hitting maxIterations without success, reflect on failure
      if (this.iteration >= this.config.maxIterations && steps.length > 0 && !steps[steps.length - 1].goalAchieved) {
        await this.sendChat('Stopped: iteration limit reached');
        await this.reflectAndRemember(
          false,
          steps.flatMap(s => s.toolCalls),
          steps.flatMap(s => s.toolResults)
        );
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

  
  /** Check if the last N identical action attempts all failed. */
  private checkStallCondition(n: number): boolean {
    if (this.actionHistory.length < n) return false;
    const window = this.actionHistory.slice(-n);
    const reference = window[0];
    
    const allErrors = window.every(entry => 
      entry.toolResults.length > 0 && entry.toolResults.every(r => r.isError)
    );
    if (!allErrors) return false;

    const referenceStr = JSON.stringify(reference.toolCalls);
    const allIdentical = window.every(entry => JSON.stringify(entry.toolCalls) === referenceStr);
    
    return allIdentical;
  }

  /** Check if a tool result indicates a transient (connection-related) error. */
  private isTransientError(result: { name: string; result: string; isError: boolean }): boolean {
    if (!result.isError) return false;
    return this.transientErrorPatterns.test(result.result);
  }


  // ─── PLAN ────────────────────────────────────────────────

  private async plan(observation: string): Promise<ToolCall[]> {
    this.throwIfAborted();
    // Add observation as user message
    let prompt = `Current World State Observation:\n${observation}\n\nReminder: Your current goal is to: ${this.config.goal}\nBased on these observations, please output a tool call to perform your next step to progress towards the goal. You are an autonomous agent, do not ask me what you should do next.`;
    
    if (this.config.enableChatResponse) {
      const chatMatch = observation.match(/"type":"chat".*?"message"\s*:\s*"([^"]+)"\s*.*?"username"\s*:\s*"([^"]+)"/);
      if (chatMatch) {
        const chatUser = chatMatch[2];
        const chatMsg = chatMatch[1];
        prompt += `\n\n[CHAT MESSAGE] ${chatUser}: "${chatMsg}" — If this message is directed at you or requests an action, acknowledge it in chat using send_chat and adjust your plan accordingly.`;
      }
    }

    if (this.checkStallCondition(3)) {
      const lastToolNames = this.actionHistory[this.actionHistory.length - 1].toolCalls.map(tc => tc.name).join(', ');
      prompt += `\n\n[SYSTEM INJECTION] You have been repetitively failing executing the action(s) (${lastToolNames}) with identical parameters resulting in sequential errors. Rethink your plan and consider using a different tool or strategy.`;
    }

    const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
    // Append to existing user message if available, otherwise create new one
    if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
      lastMsg.content += `\n\n${prompt}`;
    } else {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

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

    // Execute multiple independent tool calls in parallel for efficiency
    const executeToolWithRetry = async (call: ToolCall): Promise<{ name: string; result: string; isError: boolean }> => {
      let result = await this.executeToolCall(call);

      // Check for transient errors
      if (this.isTransientError(result)) {
        console.warn(`[Agent] Transient error in ${result.name}: ${result.result}`);
        await this.handleDisconnection();
        result = await this.executeToolCall(call);
        if (this.isTransientError(result)) {
          return result;
        }
        reconnected = true;
      }

      let retryCount = 0;
      let errorLogs = '';

      while (result.isError && retryCount < this.config.maxRetries) {
        if (this.isTransientError(result)) break;
        retryCount++;
        retriesUsed++;
        errorLogs += `Attempt ${retryCount} failed: ${result.result}\n`;

        if (retryCount === this.config.maxRetries) {
          await this.sendChat(`Failed: ${call.name} - trying alternative`);
          const altResult = await this.tryAlternative(call, errorLogs);
          if (altResult) {
            result = altResult;
            break;
          }
        }

        result = await this.executeToolCall(call);
      }

      // Truncate large results to save tokens
      const truncatedResult = result.result.length > this.maxResultLength
        ? result.result.substring(0, this.maxResultLength) + '... [truncated]'
        : result.result;

      return { ...result, result: truncatedResult };
    };

    // Execute tools sequentially to avoid race conditions and dropped promises
    const batchResults: Array<{ name: string; result: string; isError: boolean }> = [];
    let previousFailed = false;

    for (const call of toolCalls) {
      if (previousFailed) {
        // Must provide a result for skipped tools to satisfy the LLM API schema
        batchResults.push({ name: call.name, result: 'Skipped due to a previous tool error in the same batch.', isError: true });
        continue;
      }
      
      const result = await executeToolWithRetry(call);
      batchResults.push(result);
      
      if (result.isError) {
        previousFailed = true;
      }
    }

    // Add results to conversation history
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i];
      const result = batchResults[i];

      this.conversationHistory.push({
        role: 'tool',
        content: result.result,
        tool_call_id: call.id,
      });

      results.push(result);
    }

    // Optimize: Prune old conversation history to keep token count reasonable
    this.pruneConversationHistory();

    return { results, retriesUsed, disconnected: false, reconnected };
  }

  /**
   * Handle disconnection by pausing the loop and polling bot_status until reconnected.
   * Resumes the loop after reconnection is confirmed.
   */
  private async handleDisconnection(): Promise<void> {
    this.state = 'paused';
    console.log('[Agent] Bot disconnected. Attempting to reconnect...');

    const maxReconnectAttempts = 5;
    const reconnectDelayMs = 3000;

    for (let attempt = 1; attempt <= maxReconnectAttempts; attempt++) {
      if (this.abortSignal?.aborted || !this.running) return;

      try {
        console.log(`[Agent] Reconnect attempt ${attempt}/${maxReconnectAttempts}...`);

        // Re-issue bot_connect (same as main.ts does on startup)
        const connectResult = await Promise.race([
          this.mcClient.callTool('bot_connect', {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('bot_connect timed out')), 30_000)
          ),
        ]);

        const connectText = this.extractText(connectResult);
        if (!connectResult.isError) {
          console.log(`[Agent] Reconnected successfully: ${connectText.substring(0, 100)}`);
          this.state = 'running';
          return;
        }

        console.warn(`[Agent] Reconnect attempt ${attempt} failed: ${connectText.substring(0, 100)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Agent] Reconnect attempt ${attempt} error: ${msg}`);
      }

      if (attempt < maxReconnectAttempts) {
        await this.abortableDelay(reconnectDelayMs);
      }
    }

    // All attempts failed — abort the loop
    console.error('[Agent] Failed to reconnect after all attempts. Stopping loop.');
    this.running = false;
  }

  private async executeToolCall(call: ToolCall): Promise<{ name: string; result: string; isError: boolean }> {
    this.throwIfAborted();
    // Route to appropriate MCP server
    const isMemPalaceTool = call.name.startsWith('mempalace_');
    const client = isMemPalaceTool && this.memoryManager?.isConnected
      ? this.memoryManager.getClient()
      : this.mcClient;

    let timeoutMs = 120_000;
    if (call.name === 'smelt_items') {
      const amount = (call.args as any)?.amount ?? 1;
      // 10.5 seconds per item + 15 seconds buffer for furnace placement / navigation / UI
      timeoutMs = Math.max(120_000, (amount * 10_500) + 15_000);
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const toolPromise = this.abortable(client.callTool(call.name, call.args));
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`[transient] Tool call timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });
      const result = await Promise.race([toolPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const text = this.extractText(result);
      return { name: call.name, result: text, isError: result.isError };
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const msg = error instanceof Error ? error.message : String(error);
      return { name: call.name, result: `[transient] Tool execution failed: ${msg}`, isError: true };
    }
  }

  private async tryAlternative(originalCall: ToolCall, errorLogs: string): Promise<{ name: string; result: string; isError: boolean } | null> {
    // Ask LLM for an alternative approach using a temporary conversation context to avoid malformed tool histories
    const tempHistory = [...this.conversationHistory];
    
    // We must provide the tool result so far to satisfy the API
    tempHistory.push({
      role: 'tool',
      content: errorLogs || `The tool ${originalCall.name} failed.`,
      tool_call_id: originalCall.id,
    });

    tempHistory.push({
      role: 'user',
      content: `The tool ${originalCall.name} has failed ${this.config.maxRetries} times. Suggest an alternative approach using different tools.`,
    });

    try {
      const response = await this.abortable(this.llmClient.chat(
        tempHistory,
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

  private async verify(
    _results: Array<{ name: string; result: string; isError: boolean }>,
    force = false
  ): Promise<boolean> {
    this.throwIfAborted();

    // Fast path: check if any result explicitly signals success
    const anySuccess = _results.some(r =>
      !r.isError && r.result.toLowerCase().includes('successfully')
    );
    const anyError = _results.every(r => r.isError);

    // If everything errored, definitely not done
    if (anyError && _results.length > 0) return false;

    // Only invoke LLM verification every 3 iterations or on explicit success signal
    // to avoid doubling LLM calls on every step
    if (!force && !anySuccess && this.iteration % 3 !== 0) return false;

    // Full LLM verify
    let newObservation: string;
    try {
      const newObsResult = await this.abortable(this.mcClient.callTool('bot_status', {}));
      newObservation = this.extractText(newObsResult);
    } catch {
      return false;
    }

    const verificationPrompt = `You are a validator verifying if a Minecraft bot has achieved its goal.
Goal: "${this.config.goal}"
Current World State Observation:
${newObservation}

Analyze the world state (inventory, health, coordinates, status) to determine if the goal has been fully achieved.
Output a JSON object with two fields:
- "achieved": a boolean (true if the goal is fully completed, false otherwise)
- "reason": a string explaining why it is or is not completed, referencing specific items in the inventory or conditions met.

Output ONLY the JSON object. Do not include any other markdown formatting or conversational text.`;

    try {
      const response = await this.abortable(this.llmClient.chat(
        [{ role: 'user', content: verificationPrompt }],
        [] // No tools
      ));
      const msg = (response as unknown as LlmResponse)?.choices?.[0]?.message?.content;
      const msgStr = typeof msg === 'string' ? msg :
        Array.isArray(msg) ? msg.map((m: any) => m.text || '').join('') : '';

      console.log(`[AgentLoop] Verification Response: ${msgStr || '<none>'}`);

      let parsed = null;
      if (msgStr) {
        const jsonMatch = msgStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (jsonErr) {
            console.warn(`[AgentLoop] Failed to parse verification JSON: ${jsonMatch[0]}`, jsonErr);
          }
        }
      }

      if (parsed && typeof parsed.achieved === 'boolean') {
        console.log(`[AgentLoop] Verification outcome: achieved = ${parsed.achieved}. Reason: ${parsed.reason}`);
        return parsed.achieved;
      }
      
      return false;
    } catch (err) {
      console.error('[AgentLoop] Verification failed:', err);
      return false;
    }
  }

  // ─── REFLECT & REMEMBER ──────────────────────────────────

  private async reflectAndRemember(
    success: boolean,
    toolCalls: ToolCall[],
    results: Array<{ name: string; result: string; isError: boolean }>
  ): Promise<void> {
    if (!this.memoryManager) return;
    
    console.log(`[AgentLoop] Reflecting on episode (success: ${success})...`);
    
    try {
      const prompt = this.llmClient.formatReflectPrompt(this.config.goal, toolCalls, results, success);
      const response = await this.abortable(
        this.llmClient.chat([{ role: 'user', content: prompt }], [])
      );
      
      const content = (response as any).choices?.[0]?.message?.content;
      let parsed = null;
      if (typeof content === 'string') {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }
      
      if (parsed) {
        if (Array.isArray(parsed.facts) && parsed.facts.length > 0) {
          await this.abortable(this.memoryManager.addFacts(parsed.facts, 'mechanics'));
        }
        
        if (success && parsed.heuristics) {
          const room = inferSkillRoom(this.config.goal);
          await this.abortable(this.memoryManager.storeHeuristic(this.config.goal, parsed.heuristics, room));
        }
      }
      
      if (success) {
        await this.abortable(this.memoryManager.writeMilestone(this.config.goal, 'Goal achieved successfully'));
      } else {
        await this.abortable(this.memoryManager.writeFailure(this.config.goal, 'Agent failed to achieve goal', toolCalls));
      }
    } catch (err) {
      console.error('[AgentLoop] Reflection failed:', err);
      if (success) {
        await this.abortable(this.memoryManager.writeMilestone(this.config.goal, 'Goal achieved successfully (reflection failed)'));
      }
    }
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

  private async sendChat(message: string): Promise<void> {
    if (!this.config.enableChatNarration) return;
    const now = Date.now();
    if (now - this.lastChatTimeMs < this.minChatIntervalMs) return;
    this.lastChatTimeMs = now;
    try {
      await this.mcClient.callTool('send_chat', { message });
    } catch {
      // Non-critical: narration failure should not block the loop
    }
  }
}