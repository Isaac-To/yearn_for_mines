import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve the monorepo root relative to this file so .env is always found
// regardless of the current working directory (pnpm --filter changes cwd).
const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../..');

// ─── Section Schemas ──────────────────────────────────────────────────

const minecraftSchema = z.object({
  /** Minecraft server hostname */
  host: z.string().default('localhost').describe('MC_HOST'),
  /** Minecraft server port */
  port: z.coerce.number().int().positive().default(25565).describe('MC_PORT'),
  /** Bot username for connecting to the server */
  username: z.string().default('YearnForMines').describe('MC_USERNAME'),
  /** Minecraft version the server is running */
  version: z.string().default('1.21.4').describe('MC_VERSION'),
  /** Authentication mode (offline for cracked servers) */
  auth: z.enum(['offline', 'microsoft']).default('offline').describe('MC_AUTH'),
});

const mcpServerSchema = z.object({
  /** Port for the MCP HTTP server */
  port: z.coerce.number().int().positive().default(3000).describe('MCP_PORT'),
  /** Host binding for the MCP HTTP server */
  host: z.string().default('0.0.0.0').describe('MCP_HOST'),
});

const agentSchema = z.object({
  /** The goal the agent will pursue */
  goal: z.string().default('Find a tree and gather wood').describe('AGENT_GOAL'),
  /** Maximum number of agent loop iterations */
  maxIterations: z.coerce.number().int().positive().default(100).describe('AGENT_MAX_ITERATIONS'),
  /** Maximum retries per tool call before trying alternative */
  maxRetries: z.coerce.number().int().nonnegative().default(3).describe('AGENT_MAX_RETRIES'),
  /** Maximum observation tokens before truncation */
  maxObservationTokens: z.coerce.number().int().positive().default(2000).describe('AGENT_MAX_OBSERVATION_TOKENS'),
  /** Whether to enable VLM screenshot analysis */
  enableVlm: z.preprocess(
    (val) => val === 'true' || val === '1',
    z.boolean().default(false),
  ).describe('AGENT_ENABLE_VLM'),
  /** Delay between loop iterations in milliseconds */
  loopDelayMs: z.coerce.number().int().nonnegative().default(500).describe('AGENT_LOOP_DELAY_MS'),
});

const llmSchema = z.object({
  /** Base URL for the OpenAI-compatible LLM API */
  baseUrl: z.string().url().default('http://localhost:11434/v1').describe('LLM_BASE_URL'),
  /** Model name to use for chat completions */
  model: z.string().default('llama3.2').describe('LLM_MODEL'),
  /** Vision model name (optional, for screenshot analysis) */
  visionModel: z.string().optional().describe('LLM_VISION_MODEL'),
  /** API key for authenticated LLM endpoints (optional, not needed for Ollama) */
  apiKey: z.string().optional().describe('LLM_API_KEY'),
  /** Maximum tokens in LLM responses */
  maxTokens: z.coerce.number().int().positive().default(2048).describe('LLM_MAX_TOKENS'),
  /** LLM sampling temperature */
  temperature: z.coerce.number().min(0).max(2).default(0.7).describe('LLM_TEMPERATURE'),
});

const mempalaceSchema = z.object({
  /** URL for the MemPalace MCP server (optional) */
  url: z.string().url().optional().describe('MCP_MEMPALACE_URL'),
});

const webUiSchema = z.object({
  /** Port for the web UI server */
  port: z.coerce.number().int().positive().default(8080).describe('PORT'),
  /** URL for the MC MCP server (used by web UI to connect) */
  mcMcpUrl: z.string().url().default('http://localhost:3000/mcp').describe('MCP_MC_URL'),
});

// ─── Full Config Schema ───────────────────────────────────────────────

const appConfigSchema = z.object({
  minecraft: minecraftSchema,
  mcpServer: mcpServerSchema,
  agent: agentSchema,
  llm: llmSchema,
  mempalace: mempalaceSchema,
  webUi: webUiSchema,
});

export type AppConfig = Readonly<z.infer<typeof appConfigSchema>>;

// ─── Env Var Mapping ──────────────────────────────────────────────────
// Maps each schema field to its env var name so we can validate with context.

const envVarMap: Record<string, Record<string, string>> = {
  minecraft: {
    host: 'MC_HOST',
    port: 'MC_PORT',
    username: 'MC_USERNAME',
    version: 'MC_VERSION',
    auth: 'MC_AUTH',
  },
  mcpServer: {
    port: 'MCP_PORT',
    host: 'MCP_HOST',
  },
  agent: {
    goal: 'AGENT_GOAL',
    maxIterations: 'AGENT_MAX_ITERATIONS',
    maxRetries: 'AGENT_MAX_RETRIES',
    maxObservationTokens: 'AGENT_MAX_OBSERVATION_TOKENS',
    enableVlm: 'AGENT_ENABLE_VLM',
    loopDelayMs: 'AGENT_LOOP_DELAY_MS',
  },
  llm: {
    baseUrl: 'LLM_BASE_URL',
    model: 'LLM_MODEL',
    visionModel: 'LLM_VISION_MODEL',
    apiKey: 'LLM_API_KEY',
    maxTokens: 'LLM_MAX_TOKENS',
    temperature: 'LLM_TEMPERATURE',
  },
  mempalace: {
    url: 'MCP_MEMPALACE_URL',
  },
  webUi: {
    port: 'PORT',
    mcMcpUrl: 'MCP_MC_URL',
  },
};

// ─── loadConfig ───────────────────────────────────────────────────────

/**
 * Load, validate, and return the application configuration.
 *
 * Reads environment variables (loading .env via dotenv if present),
 * validates them against the Zod schema, and returns a frozen typed
 * config object. Throws on validation failure with clear error messages
 * that include the env var name.
 */
export function loadConfig(): AppConfig {
  dotenv.config({ path: resolve(monorepoRoot, '.env'), override: true });

  const raw: Record<string, unknown> = {};

  for (const [section, fields] of Object.entries(envVarMap)) {
    raw[section] = {};
    for (const [field, envVar] of Object.entries(fields)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        (raw[section] as Record<string, unknown>)[field] = value;
      }
    }
  }

  const result = appConfigSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      const section = issue.path[0] as string;
      const field = issue.path[1] as string;
      const envVar = envVarMap[section]?.[field] ?? path;
      const provided = getNestedValue(raw, issue.path);
      return `  ${envVar}: ${issue.message} (got: ${JSON.stringify(provided)})`;
    });
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return deepFreeze(result.data) as AppConfig;
}

function deepFreeze<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return Object.freeze(obj);
}

function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}