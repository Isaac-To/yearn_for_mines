import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config.js';

// Config-related env var prefixes
const CONFIG_PREFIXES = ['MC_', 'MCP_', 'LLM_', 'AGENT_', 'PORT'];

function clearConfigEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (CONFIG_PREFIXES.some(prefix => key.startsWith(prefix))) {
      delete process.env[key];
    }
  }
}

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to a clean state
    process.env = { ...originalEnv };
    clearConfigEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return defaults when no env vars are set', () => {
    const config = loadConfig();

    expect(config.minecraft.host).toBe('localhost');
    expect(config.minecraft.port).toBe(25565);
    expect(config.minecraft.username).toBe('YearnForMines');
    expect(config.minecraft.version).toBe('1.21.4');
    expect(config.minecraft.auth).toBe('offline');

    expect(config.mcpServer.port).toBe(3000);
    expect(config.mcpServer.host).toBe('0.0.0.0');

    expect(config.agent.goal).toBe('Find a tree and gather wood');
    expect(config.agent.maxIterations).toBe(100);
    expect(config.agent.maxRetries).toBe(3);
    expect(config.agent.maxObservationTokens).toBe(2000);
    expect(config.agent.enableVlm).toBe(false);
    expect(config.agent.loopDelayMs).toBe(500);

    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.model).toBe('llama3.2');
    expect(config.llm.visionModel).toBeUndefined();
    expect(config.llm.apiKey).toBeUndefined();
    expect(config.llm.maxTokens).toBe(2048);
    expect(config.llm.temperature).toBe(0.7);

    expect(config.mempalace.url).toBeUndefined();

    expect(config.webUi.port).toBe(8080);
    expect(config.webUi.mcMcpUrl).toBe('http://localhost:3000/mcp');
  });

  it('should override defaults with env vars', () => {
    process.env.MC_HOST = 'mc.example.com';
    process.env.MC_PORT = '25566';
    process.env.MC_USERNAME = 'TestBot';
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1';
    process.env.LLM_MODEL = 'gpt-4';
    process.env.LLM_API_KEY = 'sk-test-key';
    process.env.AGENT_GOAL = 'Build a house';
    process.env.AGENT_MAX_ITERATIONS = '50';
    process.env.LLM_TEMPERATURE = '0.3';
    process.env.PORT = '9090';

    const config = loadConfig();

    expect(config.minecraft.host).toBe('mc.example.com');
    expect(config.minecraft.port).toBe(25566);
    expect(config.minecraft.username).toBe('TestBot');
    expect(config.llm.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.llm.model).toBe('gpt-4');
    expect(config.llm.apiKey).toBe('sk-test-key');
    expect(config.agent.goal).toBe('Build a house');
    expect(config.agent.maxIterations).toBe(50);
    expect(config.llm.temperature).toBe(0.3);
    expect(config.webUi.port).toBe(9090);
  });

  it('should coerce string env vars to correct types', () => {
    process.env.MC_PORT = '25565';
    process.env.AGENT_MAX_ITERATIONS = '200';
    process.env.AGENT_ENABLE_VLM = 'true';
    process.env.LLM_TEMPERATURE = '0.5';
    process.env.LLM_MAX_TOKENS = '4096';

    const config = loadConfig();

    expect(config.minecraft.port).toBeTypeOf('number');
    expect(config.agent.maxIterations).toBeTypeOf('number');
    expect(config.agent.enableVlm).toBeTypeOf('boolean');
    expect(config.llm.temperature).toBeTypeOf('number');
    expect(config.llm.maxTokens).toBeTypeOf('number');
  });

  it('should throw with clear error messages on invalid config', () => {
    process.env.MC_PORT = 'not-a-number';

    expect(() => loadConfig()).toThrow('Configuration validation failed');
    expect(() => loadConfig()).toThrow('MC_PORT');
  });

  it('should throw on invalid enum value', () => {
    process.env.MC_AUTH = 'invalid-auth';

    expect(() => loadConfig()).toThrow('Configuration validation failed');
    expect(() => loadConfig()).toThrow('MC_AUTH');
  });

  it('should throw on temperature out of range', () => {
    process.env.LLM_TEMPERATURE = '5.0';

    expect(() => loadConfig()).toThrow('Configuration validation failed');
    expect(() => loadConfig()).toThrow('LLM_TEMPERATURE');
  });

  it('should include provided value in error when nested path has non-object', () => {
    // Force a nested field to be a non-object primitive to trigger getNestedValue else branch
    process.env.MC_PORT = 'not-a-number';

    expect(() => loadConfig()).toThrow('got:');
  });

  it('should return a deeply frozen object', () => {
    const config = loadConfig();

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.minecraft)).toBe(true);
    expect(Object.isFrozen(config.llm)).toBe(true);
  });

  it('should handle optional MemPalace URL', () => {
    const configWithout = loadConfig();
    expect(configWithout.mempalace.url).toBeUndefined();

    process.env.MCP_MEMPALACE_URL = 'http://localhost:8081/mcp';
    const configWith = loadConfig();
    expect(configWith.mempalace.url).toBe('http://localhost:8081/mcp');
  });

  it('should handle optional LLM fields', () => {
    const config = loadConfig();

    expect(config.llm.visionModel).toBeUndefined();
    expect(config.llm.apiKey).toBeUndefined();
  });

  it('should accept "true" and "1" as true for AGENT_ENABLE_VLM', () => {
    process.env.AGENT_ENABLE_VLM = 'true';
    expect(loadConfig().agent.enableVlm).toBe(true);

    delete process.env.AGENT_ENABLE_VLM;
    process.env.AGENT_ENABLE_VLM = '1';
    expect(loadConfig().agent.enableVlm).toBe(true);
  });

  it('should treat "false", empty, or missing AGENT_ENABLE_VLM as false', () => {
    process.env.AGENT_ENABLE_VLM = 'false';
    expect(loadConfig().agent.enableVlm).toBe(false);

    delete process.env.AGENT_ENABLE_VLM;
    expect(loadConfig().agent.enableVlm).toBe(false);
  });
});