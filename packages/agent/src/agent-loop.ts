import { McpClient } from '@yearn-for-mines/shared';
import { LlmClient, type LlmMessage, type ToolCall, type ToolDescription, type LlmResponse } from '@yearn-for-mines/shared';
import { MemoryManager } from './memory-manager.js';
import { MEMORY_CONTRACT, digest, memoryState, reflectionSchema, type ActionMemory, type EpisodeMemory, type MemoryMode } from './experience.js';
import { z } from 'zod';
import { pruneHistory, actionSignature, inventoryGoalMet } from './context.js';
import { RunTelemetry } from './telemetry.js';

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
  memoryMode: MemoryMode;
  memoryNamespace: string;
  memoryDirectory?: string;
  memoryUrl?: string;
  memoryRequired: boolean;
  memoryRecallInterval: number;
  runMetadata?: Record<string, unknown>;
  goalItems?: Record<string, number>;
  maxContextTokens: number;
  verificationInterval: number;
  telemetryFile?: string;
  botConfig?: Record<string, unknown>;
  /** The goal the agent is trying to achieve */
  goal: string;
  /** Maximum number of loop iterations */
  maxIterations: number;
  /** Maximum reconnect retries; failed mutations are replanned rather than replayed. */
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
  memoryMode: 'read-write', memoryNamespace: 'minecraft', memoryRequired: false, memoryRecallInterval: 5,
  maxContextTokens: 12000,
  verificationInterval: 5,
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
  private actionHistory: Array<{ toolCalls: ToolCall[]; toolResults: AgentStep['toolResults'] }> = [];
  private toolsDiscovered = false;
  private lastObservation = '';
  private transientErrorPatterns = /\[transient\]|\[TRANSPORT\]|fetch failed|session not found|not connected|connection refused|econnrefused|timeout/i;
  private llmCallCount = 0;
  private telemetry = new RunTelemetry();

  get metrics(): Record<string, unknown> { return { ...this.telemetry.summary(this.iteration, this.achieved), memory: this.memoryStatus }; }
  get memoryStatus(): Record<string, unknown> { return this.memoryManager?.status ?? { mode: 'off', availability: 'disabled' }; }
  private onMemory?: (event: Record<string, unknown>) => void;
  private memoryActions: ActionMemory[] = [];
  private initialObservation = '';
  private memoryContext = '';
  private toolSchemaHash = 'unknown';
  private exitReason = 'Iteration limit reached';
  private achieved = false;
  private paused = false;

  pause(): void { this.paused = true; this.state = 'paused'; }
  resume(): void { this.paused = false; if (this.running) this.state = 'running'; }
  private consecutivePlanningErrors = 0; // Track consecutive planning errors to prevent tight infinite loops

  private lastChatTimeMs = 0;
  private minChatIntervalMs = 2000;


  constructor(
    mcClient: McpClient,
    llmClient: LlmClient,
    config: Partial<AgentLoopConfig> & { goal: string },
    mempalaceClient?: McpClient,
  ) {
    this.mcClient = mcClient;
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.memoryManager = this.config.memoryMode !== 'off' && (mempalaceClient || this.config.memoryUrl)
      ? new MemoryManager(mempalaceClient, undefined, { mode: this.config.memoryMode, namespace: this.config.memoryNamespace,
        directory: this.config.memoryDirectory, url: this.config.memoryUrl, minecraftVersion: String(this.config.botConfig?.version ?? 'unknown') }) : null;
    this.memoryManager?.setEventCallback(event => {
      this.telemetry.event('memory', event);
      this.onMemory?.(event);
      if (event.operation === 'error' || event.operation === 'pending') console.warn('[Memory]', JSON.stringify(event));
    });
    this.abortSignal = config.signal;
  }

  /**
   * Set a callback to receive step updates.
   */
  setStepCallback(cb: (step: AgentStep) => void): void {
    this.onStep = cb;
  }

  setMemoryCallback(cb: (event: Record<string, unknown>) => void): void { this.onMemory = cb; }

  /** Throw if the abort signal has been triggered. */
  private throwIfAborted(): void {
    if (this.abortSignal?.aborted) {
      throw new DOMException('Agent loop aborted', 'AbortError');
    }
  }

  /** Prune old conversation history to keep context window reasonable */
  private pruneConversationHistory(): void {
    this.conversationHistory = pruneHistory(this.conversationHistory, this.config.maxContextTokens);
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
    if (this.running) throw new Error('Agent loop is already running');
    this.running = true;
    this.iteration = 0;
    this.conversationHistory = [];
    const steps: AgentStep[] = [];

    this.internalAbortController = new AbortController();
    this.abortSignal = this.internalAbortController.signal;
    this.memoryManager?.setSignal(this.abortSignal);
    const abort = () => this.internalAbortController?.abort(this.config.signal?.reason);
    if (this.config.signal?.aborted) abort();
    else this.config.signal?.addEventListener('abort', abort, { once: true });
    this.llmCallCount = 0;
    this.achieved = false;
    this.paused = false;
    this.actionHistory = [];
    this.lastObservation = '';
    this.initialObservation = '';
    this.memoryActions = [];
    this.memoryContext = '';
    this.exitReason = 'Iteration limit reached';
    this.consecutivePlanningErrors = 0;
    this.telemetry = new RunTelemetry(this.config.telemetryFile);
    this.telemetry.event('start', { goal: this.config.goal, goalItems: this.config.goalItems, model: this.llmClient.model, metadata: this.config.runMetadata });

    try {
      // Discover available tools (cached after first discovery)
      if (!this.toolsDiscovered) {
        await this.abortable(this.discoverTools());
        this.toolsDiscovered = true;
      }

      this.memoryManager?.setToolSchemaHash(this.toolSchemaHash);
      await this.abortable(this.memoryManager?.startSession());
      this.onMemory?.({ operation: 'status', status: this.memoryStatus });
      if (this.config.memoryRequired && this.memoryStatus.availability !== 'ready') throw new Error('MemPalace is required but unavailable; no agent actions were executed.');

      // Build system prompt
      const systemPrompt = this.llmClient.formatSystemPrompt(
        this.config.goal,
        this.tools,
      );

      this.conversationHistory.push({ role: 'system', content: systemPrompt });

      this.state = 'running';
      await this.sendChat(`Starting: ${this.config.goal}`);
      while (this.running && this.iteration < this.config.maxIterations) {
        this.throwIfAborted();
        while (this.paused && this.running) await this.abortableDelay(100);
        this.iteration++;
        console.log(`[AgentLoop] Iteration ${this.iteration} started`);
        
        // Track LLM calls for this iteration
        const iterationStartLlmCalls = this.llmCallCount;

        // PERCEIVE (optimize: only observe if not already observed)
        console.log('[AgentLoop] Perceiving world state...');
        let observation = this.lastObservation;
        try {
          let status = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 20000, signal: this.abortSignal });
          for (let waiting = 0; waiting < 10 && ['running', 'cancelling'].includes(this.extractData(status).actionState); waiting++) {
            await this.abortableDelay(500);
            status = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 10000, signal: this.abortSignal });
          }
          if (['running', 'cancelling'].includes(this.extractData(status).actionState)) {
            throw new Error('[BUSY] Another bot action has not settled. Stopping before spending more planning calls.');
          }
          const newObservation = this.extractText(status);
          if (status.isError) throw new Error(newObservation);

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
          if (!this.initialObservation) this.initialObservation = memoryState(observation);

          // Capture screenshot if VLM is enabled
          if (this.config.enableVlm) {
            try {
              console.log('[AgentLoop] Capturing screenshot for vision...');
              this.currentContextFrame = null;
              const screenshotResult = await this.mcClient.callTool('screenshot', {}, { timeoutMs: 15000, signal: this.abortSignal });
              const screenshotData = this.extractData(screenshotResult);
              if (screenshotData?.screenshot) {
                this.currentContextFrame = screenshotData.screenshot;
                console.log('[AgentLoop] Screenshot captured successfully');
              } else if (screenshotResult.isError) {
                this.config.enableVlm = false;
                this.tools = this.tools.filter(tool => tool.name !== 'screenshot');
                console.warn('[AgentLoop] Vision unavailable; continuing with structured observations:', this.extractText(screenshotResult));
              }
            } catch (err) {
              console.warn('[AgentLoop] Screenshot capture failed:', err instanceof Error ? err.message : String(err));
              // Continue without screenshot, it's not critical
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[AgentLoop] Perception failed: ${msg}`);
          // Trigger reconnection flow instead of silently continuing
          if (this.transientErrorPatterns.test(msg) || msg.includes('timed out') || msg.includes('disconnected')) {
            await this.handleDisconnection();
            continue; // re-perceive after reconnect
          }
          throw err;
        }

        // PLAN
        if (this.config.goalItems && inventoryGoalMet(observation, this.config.goalItems)) {
          this.achieved = true;
          const step: AgentStep = { observation, toolCalls: [], toolResults: [], goalAchieved: true, retriesUsed: 0 };
          steps.push(step);
          this.onStep?.(step);
          break;
        }
        // Refresh from the current subtask after a failure, an inventory change, or a bounded interval.
        const previous = this.actionHistory[this.actionHistory.length - 1];
        if (this.memoryManager && (this.iteration === 1 || previous?.toolResults.some(r => r.isError)
          || this.iteration % this.config.memoryRecallInterval === 0
          || (steps.length > 0 && this.inventorySignature(observation) !== this.inventorySignature(steps[steps.length - 1].observation)))) {
          await this.refreshMemories(observation);
        }
        console.log('[AgentLoop] Planning next actions...');
        const toolCalls = await this.plan(observation);
        if (this.consecutivePlanningErrors >= 3) {
          console.error(`[AgentLoop] Stopping loop: 3 consecutive LLM planning errors.`);
          this.exitReason = 'Three consecutive LLM planning errors';
          await this.sendChat(`Stopped: 3 consecutive LLM errors occurred.`);
          break;
        }
        if (this.consecutivePlanningErrors > 0) {
          await this.abortableDelay(Math.max(500, this.config.loopDelayMs));
          continue;
        }
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
          const iterationLlmCalls = this.llmCallCount - iterationStartLlmCalls;
          console.log(`[Agent] Step ${this.iteration} [no-tool-calls]: ${iterationLlmCalls} LLM calls (total: ${this.llmCallCount})`);
          steps.push(step);
          this.onStep?.(step);

          if (goalAchieved) {
            this.achieved = true;
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

          // Wait before next iteration to prevent tight loops
          if (this.config.loopDelayMs > 0) {
            await this.abortableDelay(this.config.loopDelayMs);
          }

          continue;
        }

        // Execute serially; report failures before replanning.
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
        this.achieved ||= goalAchieved;

        // Build step result
        const step: AgentStep = {
          observation,
          toolCalls,
          toolResults: results,
          goalAchieved,
          retriesUsed,
        };
        
        // Log step with LLM call count for this iteration
        const iterationLlmCalls = this.llmCallCount - iterationStartLlmCalls;
        const toolNames = toolCalls.map(tc => tc.name).join(', ') || 'none';
        console.log(`[Agent] Step ${this.iteration}: ${toolNames} (${iterationLlmCalls} LLM calls, total: ${this.llmCallCount})`);
        
        steps.push(step);
        this.onStep?.(step);

        // REFLECT & REMEMBER
        if (goalAchieved) {
          await this.sendChat(`Goal achieved: ${this.config.goal}`);
          break;
        }

        // Delay between iterations
        if (this.config.loopDelayMs > 0) {
          await this.abortableDelay(this.config.loopDelayMs);
        }

      }

      // If we exited the loop by hitting maxIterations without success, reflect on failure
      if (this.iteration >= this.config.maxIterations && steps.length > 0 && !steps[steps.length - 1].goalAchieved) {
        await this.sendChat('Stopped: iteration limit reached');
      }
    } catch (err) {
      this.exitReason = String(err);
      if (this.abortSignal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        // Graceful abort — return whatever steps were completed
        console.log('[AgentLoop] Aborted');
      } else {
        throw err;
      }
    } finally {
      this.achieved ||= steps.some(step => step.goalAchieved);
      try { await this.reflectAndRemember(); }
      catch (error) { console.warn('[Memory] Could not finish memory recording:', error); }
      await this.memoryManager?.close().catch(error => console.warn('[Memory] Disconnect failed:', error));
      this.config.signal?.removeEventListener('abort', abort);
      this.running = false;
      this.state = 'connected';
      this.achieved ||= steps.some(step => step.goalAchieved);
      this.telemetry.event('finish', { ...this.metrics, aborted: this.abortSignal?.aborted ?? false });
    }
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

  /** Total number of LLM calls made (PLAN + VERIFY) */
  get totalLlmCalls(): number {
    return this.llmCallCount;
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

    const referenceStr = actionSignature(reference.toolCalls);
    const allIdentical = window.every(entry => actionSignature(entry.toolCalls) === referenceStr);
    
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
    observation = this.compactResult(observation);
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

    // If VLM is enabled and we have a screenshot, add it to the message
    if (this.config.enableVlm && this.currentContextFrame) {
      const lastUserMsg = this.conversationHistory[this.conversationHistory.length - 1];
      if (lastUserMsg?.role === 'user' && typeof lastUserMsg.content === 'string') {
        // Convert text content to array with text + image
        lastUserMsg.content = [
          { type: 'text', text: lastUserMsg.content },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${this.currentContextFrame}`,
            },
          },
        ] as any;
      }
    }

    try {
      this.pruneConversationHistory();
      const response = await this.abortable(this.measuredChat('plan',
        this.conversationHistory,
        this.tools,
        this.config.enableVlm,
      ));
      
      this.consecutivePlanningErrors = 0; // Reset consecutive errors on successful response

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
      this.consecutivePlanningErrors++; // Increment consecutive errors on failure
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
    retriesUsed: number; disconnected: boolean; reconnected: boolean;
  }> {
    const results: AgentStep['toolResults'] = [];
    let previousFailed = false;
    for (const call of toolCalls) {
      const start = Date.now();
      let result: AgentStep['toolResults'][number];
      try { result = previousFailed
        ? { name: call.name, result: 'Skipped because a prerequisite action failed. Replan from current state.', isError: true }
        : call.argumentError
          ? { name: call.name, result: call.argumentError, isError: true }
          : await this.executeToolCall(call);
      } catch (error) {
        this.memoryActions.push({ id: call.id, name: call.name, args: call.args, result: String(error), status: 'interrupted', elapsedMs: Date.now() - start });
        this.checkpointProgress();
        throw error;
      }
      if (!['recall_memory', 'read_memory'].includes(call.name)) {
        this.memoryActions.push({ id: call.id, name: call.name, args: call.args, result: result.result,
          status: previousFailed || call.argumentError ? 'skipped' : result.isError ? 'failed' : 'completed', elapsedMs: Date.now() - start });
        this.checkpointProgress();
      }
      results.push(result);
      this.telemetry.event('tool_result', { call, ...result });
      previousFailed ||= result.isError;
      this.conversationHistory.push({ role: 'tool', tool_call_id: call.id, content: ['recall_memory', 'read_memory'].includes(call.name) ? result.result : this.compactResult(result.result) });
    }
    // All tool IDs are resolved before recovery or another LLM request.
    this.pruneConversationHistory();
    const disconnected = results.some(result => result.isError && /\[TRANSPORT\]|\[DISCONNECTED\]|not connected/i.test(result.result));
    if (disconnected) await this.handleDisconnection();
    return { results, retriesUsed: 0, disconnected: disconnected && !this.running, reconnected: disconnected && this.running };
  }

  private compactResult(text: string): string {
    const limit = this.config.maxObservationTokens * 3;
    if (text.length <= limit) return text;
    try {
      const data = JSON.parse(text);
      // Keep the outcome, prerequisites and complete inventory first.
      return JSON.stringify({ status: data.status, message: data.message, targetReached: data.targetReached,
        target: data.target, missingIngredients: data.missingIngredients, inventory: data.inventory,
        position: data.position, health: data.health, omittedDetails: true });
    } catch { return text.slice(0, limit) + '\n[additional details omitted]'; }
  }

  /**
   * Handle disconnection by pausing the loop and polling bot_status until reconnected.
   * Resumes the loop after reconnection is confirmed.
   */
  private async handleDisconnection(): Promise<void> {
    this.state = 'connecting';
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      this.throwIfAborted();
      try {
        if (!this.mcClient.isConnected) await this.mcClient.reconnect();
        const status = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 10000, signal: this.abortSignal });
        if (status.isError && /\[TRANSPORT\]|not connected|session/i.test(this.extractText(status))) {
          await this.mcClient.reconnect();
          this.toolsDiscovered = false;
        } else if (!status.isError && this.extractData(status).connected === true) {
          this.lastObservation = this.extractText(status);
          this.state = 'running';
          return;
        }
        const connected = await this.mcClient.callTool('bot_connect', this.config.botConfig ?? {}, { timeoutMs: 35000, signal: this.abortSignal });
        if (!connected.isError) {
          this.state = 'running';
          this.lastObservation = '';
          return;
        }
      } catch { this.throwIfAborted(); }
      if (attempt < this.config.maxRetries) await this.abortableDelay(1000 * (attempt + 1));
    }
    this.running = false;
    this.state = 'connected';
  }

  private async executeToolCall(call: ToolCall): Promise<{ name: string; result: string; isError: boolean }> {
    this.throwIfAborted();
    if (call.name === 'recall_memory' || call.name === 'read_memory') {
      try {
        if (!this.memoryManager) throw new Error('Memory is disabled');
        let result: string;
        if (call.name === 'recall_memory') {
          const args = z.object({ query: z.string().min(1).max(1500), entities: z.array(z.string().max(120)).max(2).default([]) }).parse(call.args);
          result = await this.memoryManager.recall(args.query, args.entities);
        } else {
          const args = z.object({ id: z.string().min(1), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(10).default(5) }).parse(call.args);
          result = await this.memoryManager.readEpisode(args.id, args.offset, args.limit);
        }
        return { name: call.name, result, isError: false };
      } catch (error) { return { name: call.name, result: String(error), isError: true }; }
    }
    const timeoutMs = call.name === 'smelt_items'
      ? Math.max(120000, Math.min(64, Number(call.args.amount) || 1) * 10500 + 45000) : 300000;
    const start = Date.now();
    try {
      const result = await this.mcClient.callTool(call.name, call.args, { timeoutMs, signal: this.abortSignal });
      return { name: call.name, result: this.extractText(result), isError: result.isError };
    } catch (error) {
      this.throwIfAborted();
      return { name: call.name, result: String(error), isError: true };
    } finally {
      this.telemetry.actionCalls++;
      this.telemetry.actionMs += Date.now() - start;
      this.telemetry.event('action', { name: call.name, args: call.args, elapsedMs: Date.now() - start });
    }
  }

  private async measuredChat(phase: string, messages: LlmMessage[], tools: ToolDescription[] = [], vision = false): Promise<LlmResponse> {
    const start = Date.now();
    this.llmCallCount++;
    let response: LlmResponse | undefined;
    let failure: string | undefined;
    try {
      response = await this.llmClient.chat(messages, tools, vision, { signal: this.abortSignal }) as unknown as LlmResponse;
      return response;
    } catch (error) {
      failure = String(error);
      throw error;
    } finally { this.telemetry.recordLlm(phase, Date.now() - start, response, failure); }
  }

  // ─── VERIFY ──────────────────────────────────────────────

  private async verify(
    _results: Array<{ name: string; result: string; isError: boolean }>,
    force = false
  ): Promise<boolean> {
    this.throwIfAborted();

    const anyError = _results.every(r => r.isError);

    // If everything errored, definitely not done
    if (anyError && _results.length > 0) return false;

    // Only invoke LLM verification every 3 iterations or on explicit success signal
    // to avoid doubling LLM calls on every step
    if (!this.config.goalItems && !force && this.iteration % this.config.verificationInterval !== 0) return false;

    // Full LLM verify
    let newObservation: string;
    try {
      const newObsResult = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 10000, signal: this.abortSignal });
      if (newObsResult.isError) return false;
      newObservation = this.extractText(newObsResult);
      this.lastObservation = newObservation;
    } catch {
      return false;
    }

    if (this.config.goalItems) return inventoryGoalMet(newObservation, this.config.goalItems);

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
      const response = await this.abortable(this.measuredChat('verify',
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

  private buildEpisode(): EpisodeMemory {
    return {
      id: this.telemetry.runId, contract: MEMORY_CONTRACT, namespace: this.config.memoryNamespace,
      minecraftVersion: String(this.config.botConfig?.version ?? 'unknown'), toolSchemaHash: this.toolSchemaHash,
      goal: this.config.goal, goalItems: this.config.goalItems, startedAt: new Date(this.telemetry.startedAt).toISOString(), endedAt: new Date().toISOString(),
      outcome: this.achieved ? 'success' : this.abortSignal?.aborted ? 'interrupted' : 'failure',
      verification: this.achieved ? this.config.goalItems ? 'inventory' : 'llm' : 'none',
      reason: this.achieved ? 'Goal verified against the final observation' : this.abortSignal?.aborted ? 'Run interrupted; last action may have partially executed' : this.exitReason,
      initialState: this.initialObservation, finalState: memoryState(this.lastObservation), actions: this.memoryActions,
      recalledIds: this.memoryManager?.recalledIds ?? [], metrics: this.telemetry.summary(this.iteration, this.achieved),
    };
  }

  private checkpointProgress(): void {
    if (!this.memoryManager || !this.initialObservation) return;
    const episode = this.buildEpisode();
    episode.outcome = 'interrupted';
    episode.verification = 'none';
    episode.reason = 'Progress checkpoint; run completion has not been recorded';
    this.memoryManager.checkpoint(episode);
  }

  private async reflectAndRemember(): Promise<void> {
    if (!this.memoryManager || this.memoryManager.mode !== 'read-write' || !this.initialObservation) return;
    const episode = this.buildEpisode();
    // Preserve exact evidence locally before the optional LLM reflection (which may fail or be stopped).
    this.memoryManager.checkpoint(episode);
    if (!this.abortSignal?.aborted && this.consecutivePlanningErrors === 0 && this.memoryActions.length) {
      try {
        const actions = this.memoryActions.slice(-30);
        const prompt = this.llmClient.formatReflectPrompt(this.config.goal,
          actions.map(a => ({ id: a.id, name: a.name, args: a.args })),
          actions.map(a => ({ result: `${a.status}: ${a.result.slice(0, 1200)}`, isError: a.status !== 'completed' })), this.achieved);
        const response = await this.measuredChat('reflect', [{ role: 'user', content: prompt }]);
        const content = response.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) episode.reflection = reflectionSchema.parse(JSON.parse(match[0]));
        }
      } catch (error) { this.telemetry.event('memory', { operation: 'reflection_failed', error: String(error) }); }
    }
    episode.metrics = this.telemetry.summary(this.iteration, this.achieved);
    // Stop cancels gameplay immediately, but a bounded final memory write uses its own signal.
    this.memoryManager.setSignal(AbortSignal.timeout(8000));
    await this.memoryManager.rememberEpisode(episode);
  }

  private inventorySignature(observation: string): string {
    try { return JSON.stringify(JSON.parse(observation).inventory ?? []); } catch { return ''; }
  }

  private async refreshMemories(observation: string): Promise<void> {
    if (!this.memoryManager) return;
    const previous = this.actionHistory[this.actionHistory.length - 1];
    const query = `${this.config.goal}\nRecent subtask: ${previous?.toolCalls.map(c => `${c.name} ${JSON.stringify(c.args)}`).join('; ') ?? 'starting'}\n${previous?.toolResults.filter(r => r.isError).map(r => r.result.slice(0, 350)).join('; ') ?? ''}`;
    const entities = [...new Set([...Object.keys(this.config.goalItems ?? {}), ...(query.match(/\b[a-z]+_[a-z_]+\b/g) ?? [])])].slice(0, 2);
    this.memoryContext = await this.abortable(this.memoryManager.recall(query, entities));
    if (this.config.memoryRequired && this.memoryManager.status.availability !== 'ready') throw new Error('Required MemPalace retrieval failed; stopping this run.');
    // Replace the previous memory block instead of accumulating duplicate context on every refresh.
    this.conversationHistory[0] = { role: 'system', content: this.llmClient.formatSystemPrompt(this.config.goal, this.tools, this.memoryContext) };
    this.telemetry.event('memory_context', { iteration: this.iteration, observation: memoryState(observation), ids: this.memoryManager.recalledIds });
  }

  // ─── UTILITIES ───────────────────────────────────────────

  private async discoverTools(): Promise<void> {
    const mcTools = await this.abortable(this.mcClient.listTools());
    this.tools = mcTools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));

    this.tools = this.tools.filter(tool => !['craft_macro', 'interact_block_macro', 'bot_connect', 'bot_disconnect', 'bot_status'].includes(tool.name)
      && (this.config.enableVlm || tool.name !== 'screenshot'));
    this.toolSchemaHash = digest([...this.tools].sort((a, b) => a.name.localeCompare(b.name)));
    if (this.memoryManager) this.tools.push(
      { name: 'recall_memory', description: 'Search past successful action sequences and failures for a current subtask. Use when prerequisites are unclear or an action fails. Returns memory ids. Historical evidence must be checked against current state.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, entities: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, required: ['query'], additionalProperties: false } },
      { name: 'read_memory', description: 'Read the actual tools, arguments, results, and starting/final conditions of a memory id from recall_memory. Adapt to this world; do not replay failed/skipped actions. Paginate with offset.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['id'], additionalProperties: false } },
    );
  }

  private extractText(result: { content: Array<{ type: string; text?: string }> } | null | undefined): string {
    if (!result?.content) return '';
    return result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }

  private extractData(result: { content: Array<{ type: string; text?: string }> } | null | undefined): Record<string, any> {
    if (!result?.content) return {};
    const textContent = result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
    try {
      return JSON.parse(textContent);
    } catch {
      return {};
    }
  }

  private async sendChat(message: string): Promise<void> {
    if (!this.config.enableChatNarration || !this.tools.some(tool => tool.name === 'send_chat')) return;
    const now = Date.now();
    if (now - this.lastChatTimeMs < this.minChatIntervalMs) return;
    this.lastChatTimeMs = now;
    try {
      await this.mcClient.callTool('send_chat', { message }, { timeoutMs: 5000, signal: this.abortSignal });
    } catch {
      // Non-critical: narration failure should not block the loop
    }
  }
}
