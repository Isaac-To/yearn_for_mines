import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LlmResponse } from '@yearn-for-mines/shared';

export class RunTelemetry {
  readonly runId = randomUUID();
  readonly startedAt = Date.now();
  llmCalls = 0;
  failedLlmCalls = 0;
  promptTokens = 0;
  completionTokens = 0;
  callsWithUsage = 0;
  inferenceMs = 0;
  actionMs = 0;
  actionCalls = 0;
  constructor(private file?: string) {}
  event(type: string, data: Record<string, unknown>): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify({ runId: this.runId, time: new Date().toISOString(), type, ...data }) + '\n');
    } catch (error) { console.warn('[Telemetry] Could not write event:', error); }
  }
  recordLlm(phase: string, elapsedMs: number, response?: LlmResponse, error?: string): void {
    this.llmCalls++;
    this.inferenceMs += elapsedMs;
    if (error) this.failedLlmCalls++;
    if (response?.usage?.prompt_tokens !== undefined && response.usage.completion_tokens !== undefined) {
      this.callsWithUsage++;
      this.promptTokens += response.usage.prompt_tokens;
      this.completionTokens += response.usage.completion_tokens;
    }
    this.event('llm', { phase, elapsedMs, usage: response?.usage ?? null, error: error ?? null });
  }
  summary(iterations: number, achieved: boolean): Record<string, unknown> {
    return { iterations, achieved, elapsedMs: Date.now() - this.startedAt, llmCalls: this.llmCalls,
      failedLlmCalls: this.failedLlmCalls, promptTokens: this.promptTokens, completionTokens: this.completionTokens,
      tokenUsageComplete: this.callsWithUsage === this.llmCalls, callsWithUsage: this.callsWithUsage,
      tokensPerAchievement: achieved && this.callsWithUsage === this.llmCalls ? this.promptTokens + this.completionTokens : null,
      inferenceMs: this.inferenceMs, actionCalls: this.actionCalls, actionMs: this.actionMs,
      averageActionMs: this.actionCalls ? this.actionMs / this.actionCalls : null };
  }
}
