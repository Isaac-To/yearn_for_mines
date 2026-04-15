## Context

This is a greenfield project building an agentic system for Minecraft bot control. No existing codebase exists — the project directory contains only the openspec scaffolding and .claude configuration.

Key constraints:
- Mineflayer is Node.js/TypeScript-native (required for Minecraft bot)
- MemPalace is Python-native with 29 MCP tools (runs as separate process)
- Ollama provides an OpenAI-compatible endpoint at localhost:11434/v1
- The project targets research-paper quality with 95% test coverage
- MVP scope: bot finds a tree and gathers wood

Stakeholders: The project author (hobby project with potential research paper submission).

## Goals / Non-Goals

**Goals:**
- Build an MCP server from scratch that exposes Mineflayer bot actions as standardized tools
- Build an agent controller implementing perceive-plan-execute-verify-remember loop
- Use MemPalace exclusively for all persistent memory (skills, facts, diary, search)
- Support text-first observations with optional VLM enhancement via Ollama multimodal models
- Provide a web debug UI for real-time monitoring
- Achieve 95% code coverage with Vitest
- Ensure reproducibility via Docker Compose and Python venv
- Demonstrate MVP: bot finds a tree and gathers wood

**Non-Goals:**
- Multi-agent coordination (single bot only for MVP)
- Minecraft Bedrock Edition support (Java Edition only)
- Combat or mob interaction (future scope)
- Redstone or complex building (future scope)
- Cloud deployment (local-only for MVP)
- Custom LLM fine-tuning (use off-the-shelf Ollama models)
- Alternative memory backends beyond MemPalace

## Decisions

### Decision 1: TypeScript monorepo with pnpm workspaces

**Choice**: TypeScript monorepo with pnpm workspaces and Python venv for MemPalace.

**Alternatives considered**:
- *Python monorepo*: Would require bridging Mineflayer (JS) via subprocess or HTTP. Loses type safety and direct API access.
- *Polyglot with mixed runtimes*: Two languages increases CI/CD complexity and makes 95% coverage harder.
- *Rust*: No Mineflayer bindings, would need FFI or protocol implementation from scratch.

**Rationale**: Mineflayer and the MCP TypeScript SDK are both native TypeScript. The agent controller and MCP server share the same runtime. MemPalace runs as a separate Python MCP server process — no Python code in our codebase. This gives us unified tooling, type safety across the entire agent stack, and simpler testing.

**Workspace structure**:
```
yearn_for_mines/
├── packages/
│   ├── mc-mcp-server/       # MCP server wrapping Mineflayer
│   ├── agent/                # Agent controller (perceive-plan-execute-verify-remember)
│   ├── web-ui/               # Debug dashboard (Express + Vite React)
│   └── shared/               # Shared types, schemas, utilities
├── python/                   # MemPalace venv and config (not our code)
├── docker/                   # Docker Compose and Dockerfiles
├── openspec/                 # Change management
└── pnpm-workspace.yaml
```

### Decision 2: MCP server built from scratch, not forked

**Choice**: Build the MC MCP server from scratch rather than forking existing servers.

**Alternatives considered**:
- *Fork risnake/minecraft-mcp-server*: Has creative + survival modes, but tool schemas are not well-typed for agentic use. Tight coupling to specific bot lifecycle assumptions.
- *Fork haksnbot*: 40+ tools but includes many domain-specific tools (QuickShop, GriefPrevention) we don't need. Mixed quality.
- *Fork mcpmc*: JSON-RPC interface, not standard MCP tool format.

**Rationale**: Existing servers are thin wrappers designed for human-in-the-loop LLM chat. Our agent needs tool schemas optimized for autonomous planning — structured input/output schemas, error metadata for self-correction, and observation tools that return precisely what the agent loop needs. Building from scratch gives us full control over tool design for the perceive-plan-execute-verify loop, clean separation of concerns, and TDD-first development.

### Decision 3: Agent as MCP client, not in-process

**Choice**: The agent controller connects to the MC MCP server and MemPalace MCP server as separate processes via MCP client SDK.

**Alternatives considered**:
- *In-process Mineflayer*: Import Mineflayer directly in the agent. Tighter coupling, harder to test, no standard tool interface.
- *HTTP API wrapper*: Custom REST API instead of MCP. Proprietary, no ecosystem compatibility.

**Rationale**: MCP client architecture gives us clean process isolation, standard tool interface, testability (mock MCP servers), and the ability to use the MC MCP server with other MCP-compatible clients (Claude Desktop, etc.). The agent is just an orchestrator that makes tool calls — it doesn't need to know Mineflayer internals.

### Decision 4: Text-first observations, VLM optional

**Choice**: Observations are structured text by default. VLM screenshot input is an optional enhancement triggered when available.

**Alternatives considered**:
- *VLM-only*: Depends entirely on Ollama multimodal model quality, which varies significantly. Breaks if model can't parse screenshots.
- *No VLM*: Misses spatial reasoning opportunities. Voyager showed pure text is insufficient for building/navigation tasks.

**Rationale**: Ollama's multimodal models (llava, qwen2-vl, minicpm-v) are less capable than GPT-4V/Claude for visual understanding. The core agent loop MUST work with text-only observations. VLM screenshots are captured via prismarine-viewer headless rendering and appended to the LLM prompt when a multimodal model is configured. This makes the system robust to model limitations while enabling richer perception when available.

### Decision 5: MemPalace-only memory architecture

**Choice**: All persistent memory goes through MemPalace MCP tools. No separate skill library.

**Alternatives considered**:
- *Voyager-style skill library*: Flat vector store of JavaScript functions. No temporal tracking, no failure memory, no cross-referencing.
- *Dual system*: MemPalace for facts + custom skill library for code. More complexity, two sources of truth, synchronization burden.

**Rationale**: MemPalace provides strictly more capability than Voyager's skill library:
- Drawers store skill code verbatim (no summarization loss)
- Knowledge graph tracks temporal validity of skills and facts
- Semantic search with wing/room filtering outperforms flat embedding retrieval
- Diary entries capture failure contexts Voyager discards
- Tunnels connect related skills across domains

The wing structure maps naturally: `minecraft-skills/wood-gathering`, `minecraft-skills/crafting`, `minecraft-skills/navigation`, etc.

### Decision 6: Streamable HTTP transport for MCP servers

**Choice**: Both MCP servers use Streamable HTTP transport (not stdio).

**Alternatives considered**:
- *Stdio*: Simpler for single-process, but prevents web UI from connecting to servers. Requires agent to spawn child processes.
- *HTTP+SSE*: Deprecated transport.

**Rationale**: Streamable HTTP allows the web debug UI to connect to the same MCP servers for live observation. The agent and web UI can both be MCP clients. Stdio would require agent to manage child process lifecycle. HTTP enables future remote access and multi-client scenarios.

### Decision 7: Docker Compose for reproducibility

**Choice**: Docker Compose orchestrating Minecraft server, MC MCP server, MemPalace, agent controller, and web UI.

**Rationale**: Research paper artifact evaluation requires one-command startup. Docker Compose provides deterministic environments for all components. The Minecraft server runs in a container, avoiding host installation requirements. Python venv for MemPalace is used during development; Docker provides the production isolation.

## Risks / Trade-offs

- **[Ollama model quality]** Local LLMs are less capable than GPT-4 for code generation and planning → Mitigate with text-first observations (less ambiguous), structured tool schemas (less room for error), and MemPalace memory (fewer repeated mistakes). MVP scope (find tree, gather wood) is achievable with current local models.

- **[VLM screenshot quality]** Prismarine-viewer headless rendering may produce low-quality screenshots → Mitigate by making VLM optional; text observations carry the agent. Evaluate screenshot quality during development.

- **[MemPalace as Python dependency]** Requires separate Python process and ChromaDB → Mitigate with Docker Compose; MemPalace is pip-installable with minimal dependencies. Accept operational complexity for memory capability gains.

- **[Mineflayer version compatibility]** Mineflayer supports MC 1.8–1.21.11 but different versions have different block IDs and behaviors → Pin to MC 1.21.x for MVP. Document version assumptions in tool schemas.

- **[Action timing and anti-cheat]** Minecraft servers have timing requirements for actions (dig cooldowns, attack cooldowns) and anti-cheat plugins may detect bots → MVP targets local/offline servers. Document timing requirements in tool implementations. Add configurable delays.

- **[95% coverage with external dependencies]** Mineflayer, MemPalace, and Ollama are external services → Use dependency injection and mock interfaces. Test tool schemas, agent loop logic, and memory integration independently. Coverage target applies to our code, not integration with external services.