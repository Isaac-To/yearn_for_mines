## 1. Project Setup and Infrastructure

- [ ] 1.1 Initialize pnpm monorepo with workspace packages (mc-mcp-server, agent, web-ui, shared), tsconfig, eslint, prettier
- [ ] 1.2 Create Python venv for MemPalace, install mempalace and chromadb, verify MCP server starts
- [ ] 1.3 Write Docker Compose configuration for Minecraft server, MC MCP server, MemPalace, agent, and web UI
- [ ] 1.4 Configure Vitest with 95% coverage threshold across all packages
- [ ] 1.5 Set up CI pipeline for lint, type-check, test, and coverage enforcement

## 2. Shared Package

- [ ] 2.1 Define shared TypeScript types: MCP tool schemas (Zod), bot state types, observation types, MemPalace types
- [ ] 2.2 Implement MCP client utility wrapping @modelcontextprotocol/sdk client with reconnection logic
- [ ] 2.3 Implement OpenAI-compatible API client for Ollama (chat completions with tool calling support)
- [ ] 2.4 Write unit tests for all shared utilities (types, client wrappers) with 95% coverage

## 3. Minecraft MCP Server — Bot Lifecycle and Observation Tools

- [ ] 3.1 Implement bot lifecycle management: createBot, connect, disconnect, respawn with Zod-validated MCP tool schemas
- [ ] 3.2 Implement comprehensive observation tool: observe (position, health, food, saturation, oxygen, experience, game mode, dimension, biome, weather, time, held item with durability, armor, status effects, inventory, nearby blocks with diggability, nearby entities with hostility, nearby dropped items, light level, ground distance, attack cooldown, active dig progress)
- [ ] 3.3 Implement focused observation tools: find_block, find_entity, get_inventory (with durability/enchantments), get_position, get_hud (full heads-up display data), get_craftable (what can be made from current inventory), get_tool_effectiveness, get_nearby_items, look_at_block, entity_at_cursor, get_attack_cooldown
- [ ] 3.4 Implement Streamable HTTP transport for MCP server with multi-client support
- [ ] 3.5 Write integration tests for bot lifecycle (connect/disconnect to local MC server) and observation tools
- [ ] 3.6 Write unit tests for Zod schema validation, tool input/output formatting, error handling (95% coverage)

## 4. Minecraft MCP Server — Action Tools

- [ ] 4.1 Implement movement tools: pathfind_to (using mineflayer-pathfinder), look_at with Zod schemas
- [ ] 4.2 Implement block interaction tools: dig_block, place_block with equipment management and error handling
- [ ] 4.3 Implement crafting tools: craft_item with recipe lookup, material verification, and crafting table detection
- [ ] 4.4 Implement inventory tools: equip_item, drop_item, use_item with slot management
- [ ] 4.5 Implement chat and communication tools: chat, whisper, screenshot (prismarine-viewer integration), look_at_block, entity_at_cursor
- [ ] 4.6 Implement event subscription notifications: block changes, entity spawn/despawn/death/movement, player damage/heal, food change, experience change, item pickup, weather change, sound effects, particles — all the real-time events a player would see/hear on screen
- [ ] 4.7 Implement player HUD tools: get_hud (full heads-up display: health, food, saturation, oxygen, experience, armor, hotbar, status effects, boss bars), get_attack_cooldown, block breaking progress
- [ ] 4.8 Implement bot status MCP resource (bot://status) returning real-time state
- [ ] 4.7 Write tests for all action tools with mocked Mineflayer bot (95% coverage)

## 5. Observation Pipeline

- [ ] 5.1 Implement comprehensive text observation formatter: position, health/food/saturation/oxygen, experience, game mode, dimension, biome, weather, time of day, held item (with durability and enchantments), armor, status effects, hotbar contents, inventory summary, nearby blocks (with diggability, effective tools, dig time), nearby entities (with hostility, health, equipment, behavior state), nearby dropped items (with despawn info), light level, ground distance, attack cooldown, environmental hazards (lava, water, fire, fall risk), craftability from current inventory
- [ ] 5.2 Implement VLM screenshot capture using prismarine-viewer with headless rendering fallback (Xvfb)
- [ ] 5.3 Implement observation enrichment: block diggability/tool effectiveness/entity hostility/inventory craftability/environmental hazard detection/item value assessment
- [ ] 5.4 Implement event enrichment: incorporate recent sound/particle/block change notifications into observation text (e.g., "You hear a zombie growling nearby to the north")
- [ ] 5.5 Implement combat threat prioritization: when hostile mobs are nearby, highlight them with distance, health, and attack readiness
- [ ] 5.6 Implement token limit truncation for observations (configurable, default 2000 tokens) with priority ordering (position, health, threats first; distant entities, redundant blocks last)
- [ ] 5.7 Write tests for all observation formatters with fixture data (95% coverage)

## 6. Agent Controller — Core Loop

- [ ] 6.1 Implement perceive phase: call observation MCP tools, format text observation, optionally capture screenshot
- [ ] 6.2 Implement plan phase: construct system prompt with tool descriptions and MemPalace memories, send to LLM, parse tool calls
- [ ] 6.3 Implement execute phase: route tool calls to appropriate MCP server (MC or MemPalace), collect results
- [ ] 6.4 Implement verify phase: re-observe world state, compare against expected outcome, determine success/failure
- [ ] 6.5 Implement remember phase: store verified skills (mempalace_add_drawer), record failures (mempalace_diary_write), update KG (mempalace_kg_add)
- [ ] 6.6 Implement retry logic: up to 3 retries with error feedback to LLM, then try alternative approach
- [ ] 6.7 Implement agent loop orchestrator connecting all phases with configurable goal
- [ ] 6.8 Write tests for agent loop with mocked MCP servers and LLM responses (95% coverage)

## 7. Memory Integration

- [ ] 7.1 Implement MemPalace MCP client: connect to MemPalace server, call all 29 tools
- [ ] 7.2 Implement skill storage: format verified skill sequences as drawers, check duplicates before storing
- [ ] 7.3 Implement skill retrieval: search MemPalace by goal description, format results for LLM prompt
- [ ] 7.4 Implement knowledge graph management: add facts, invalidate outdated facts, query current facts
- [ ] 7.5 Implement diary entries: write failure descriptions and milestone records
- [ ] 7.6 Implement wing/room initialization: create minecraft-skills wing (wood-gathering, crafting, mining, navigation, combat, farming, survival) and minecraft-knowledge wing (blocks, items, mobs, recipes, biomes, mechanics)
- [ ] 7.7 Implement knowledge bootstrap: seed MemPalace KG with fundamental Minecraft knowledge (block diggability, common recipes, mob hostility, survival mechanics, tool durability) on first run only
- [ ] 7.7 Write tests for all MemPalace integration with mocked MCP server (95% coverage)

## 8. Web Debug UI

- [ ] 8.1 Set up Express server with WebSocket connection for real-time updates
- [ ] 8.2 Implement bot status panel: position, health/food/saturation/oxygen bars, experience, armor, held item with durability, status effects, biome, weather, time of day, connection indicator (live updating via WebSocket)
- [ ] 8.3 Implement action history log: timestamped tool calls, LLM prompts/responses, errors highlighted, event stream (block changes, entity spawns, sounds, particles)
- [ ] 8.4 Implement memory inspector: skill list by wing/room, knowledge graph browser, diary entries
- [ ] 8.5 Implement agent control panel: start (with goal input), pause, resume, stop
- [ ] 8.6 Implement screenshot view: display bot's perspective when VLM is enabled, placeholder when disabled
- [ ] 8.7 Write component tests for all UI panels with mocked WebSocket data

## 9. End-to-End Integration and MVP Validation

- [ ] 9.1 Run full stack locally: MC server, MC MCP server, MemPalace, agent, web UI via Docker Compose
- [ ] 9.2 Test MVP scenario: agent finds a tree and gathers wood with MemPalace memory enabled
- [ ] 9.3 Test MVP scenario: agent fails initially, retries, and succeeds on second attempt
- [ ] 9.4 Test MVP scenario: agent retrieves a stored skill from MemPalace on second run
- [ ] 9.5 Verify 95% code coverage across all packages
- [ ] 9.6 Write documentation: README, architecture diagram, setup guide, configuration reference