export interface LlmResponse {
  choices: Array<{
    message: {
      tool_calls?: Array<{
        id: string;
        type?: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
      content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
    };
  }>;
}

export interface LlmClientOptions {
  baseUrl: string;
  model: string;
  visionModel?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ToolDescription {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export class LlmClient {
  public readonly baseUrl: string;
  public readonly model: string;
  public readonly visionModel: string | undefined;
  public readonly apiKey: string | undefined;
  public readonly maxTokens: number;
  public readonly temperature: number;

  constructor(private options: LlmClientOptions) {
    this.baseUrl = options.baseUrl;
    this.model = options.model;
    this.visionModel = options.visionModel;
    this.apiKey = options.apiKey;
    this.maxTokens = options.maxTokens ?? 2048;
    this.temperature = options.temperature ?? 0.7;
  }

  /**
   * Format a system prompt that includes tool descriptions and optional memory context.
   */
  formatSystemPrompt(goal: string, tools: ToolDescription[], memoryContext?: string): string {
    // Build a compact tool reference
    const toolList = tools.length > 0
      ? tools.map(t => `  - ${t.name}: ${t.description}`).join('\n')
      : '  (none available)';

    const memorySection = memoryContext
      ? `\nRelevant memories:\n${memoryContext}`
      : '';

    return `You are an autonomous Minecraft agent. Your goal: ${goal}

You perceive the world through structured text observations and take actions through MCP tools. This is a real-time 3D voxel world — think carefully about space, distance, and the order of operations.

## How to Read Your Observation

Each observation tells you:
- Vital Stats: health (█ bars), food, oxygen, position (x,y,z), dimension, biome, time of day
- Inventory: what you're carrying and item counts
- Points of Interest: nearby blocks, entities, and dropped items with distances
- Recent Events: things that just happened around you (block changes, sounds, damage)

Your position uses Minecraft coordinates: x = east/west, y = up/down (sea level ~64), z = north/south. Distance is in blocks.

## How to Think

1. **Look first.** Call get_observation to understand your surroundings before acting.
2. **Plan spatially.** You exist in a 3D world. To get from point A to B, use reposition(). To gather something, use gather_materials(). To craft, use craft_macro().
3. **Use the right tool for the job.** gather_materials() finds and collects blocks autonomously. craft_macro() handles crafting tables automatically. reposition() uses pathfinding.
4. **Check your inventory.** Use get_inventory() to see what you have before deciding what to craft or build.
5. **Notice events.** get_events() returns recent world changes — mob sounds, block updates, damage taken.

## Tool Rules

- If a tool fails, retry up to 3 times. If it still fails, try a different approach entirely.
- Always include ALL required arguments from the tool schema. Missing arguments cause errors.
- You MUST call at least one tool per iteration. Do NOT respond with just text — pick a tool and use it.
- After successful actions, verify your progress by calling get_observation() again.${memorySection}

## Available Tools

${toolList}`;
  }

  /**
   * Format a prompt that instructs the LLM to reflect on an episode and extract
   * semantic facts and generalized procedural strategies.
   */
  formatReflectPrompt(goal: string, toolCalls: ToolCall[], results: any[], success: boolean): string {
    const episodeContext = toolCalls.map((tc, i) => {
      const resultObj = results[i];
      let resultStr = 'Unknown';
      if (resultObj) {
        if (resultObj.isError) {
          resultStr = `Error: ${JSON.stringify(resultObj.content)}`;
        } else {
          resultStr = `Success: ${JSON.stringify(resultObj.content)}`;
        }
      }
      return `Step ${i + 1}: Tool '${tc.name}' with args ${JSON.stringify(tc.args)}\nOutcome: ${resultStr}`;
    }).join('\n\n');

    return `You are an AI reflecting on your recent actions in Minecraft.
Your goal was: ${goal}
The episode ended in: ${success ? 'SUCCESS' : 'FAILURE'}

Here is the exact sequence of actions and their outcomes:
${episodeContext}

Your task is to analyze this episode and extract valuable knowledge for future use. Do not repeat the exact steps. Extract universal rules and generalized strategies.

If you learned any universal factual truths (e.g., "Wood requires a stone pickaxe or better" or "Lava instantly kills"), specify them as facts.
For procedural strategies, extract:
- Pre-conditions: What must be true before starting this task?
- Strategy Steps: A conceptual, generalized step-by-step guide (e.g., "Locate nearest wood block, ensure clear path, walk to it, hold attack until broken").
- Post-conditions: What is the expected world state after completing this?

Reflect critically. Determine what actually caused the ${success ? 'success' : 'failure'}.
Output ONLY a JSON object in this exact format (do not put it in a markdown block, just pure JSON):
{
  "facts": [{ "entity": "string", "relationship": "string", "target": "string" }],
  "heuristics": {
    "preConditions": "string",
    "strategySteps": "string",
    "postConditions": "string"
  }
}`;
  }

  /**
   * Format messages for the LLM, optionally including a screenshot for multimodal models.
   */
  formatMessages(systemPrompt: string, observation: string, screenshotBase64?: string): LlmMessage[] {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (screenshotBase64 && this.visionModel) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: observation },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: observation,
      });
    }

    return messages;
  }

  /**
   * Parse tool calls from an LLM response.
   * Returns an empty array if the response contains no tool calls.
   */
  parseToolCalls(response: LlmResponse): ToolCall[] {
    const choice = response.choices?.[0];
    if (!choice?.message?.tool_calls) {
      return [];
    }

    return choice.message.tool_calls.map((tc) => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        // Malformed JSON arguments — return empty object
        args = {};
      }

      return {
        id: tc.id,
        name: tc.function.name,
        args,
      };
    });
  }

  /**
   * Build the request body for the OpenAI-compatible chat completions API.
   */
  buildRequestBody(
    messages: LlmMessage[],
    tools: ToolDescription[],
    useVision?: boolean,
  ): Record<string, unknown> {
    const model = useVision && this.visionModel ? this.visionModel : this.model;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema ?? { type: 'object', properties: {} },
        },
      }));
      body.tool_choice = 'auto';
    }

    return body;
  }

  /**
   * Send a chat completion request to the LLM endpoint.
   */
  async chat(
    messages: LlmMessage[],
    tools: ToolDescription[],
    useVision?: boolean,
  ): Promise<Record<string, unknown>> {
    const body = this.buildRequestBody(messages, tools, useVision);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Check if the LLM endpoint is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/v1', '')}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from the LLM endpoint.
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl.replace('/v1', '')}/api/tags`);
    if (!response.ok) {
      return [];
    }
    const data = await response.json() as { models?: Array<{ name: string }> };
    return data.models?.map((m) => m.name) ?? [];
  }
}