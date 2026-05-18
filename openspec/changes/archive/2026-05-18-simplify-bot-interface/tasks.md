## 1. Clean up MCP Server Tools

- [x] 1.1 Remove `registerLifecycleTools` and its associated tools (`bot_connect`, `bot_disconnect`, etc.) from `mc-mcp-server`.
- [x] 1.2 Remove tool-based observation registrations (`observe`, `get_inventory`, `get_position`, `bot_status`) from `mc-mcp-server`.
- [x] 1.3 Remove separate crafting and interaction tools (`registerGatherMaterialsTool`, `registerCraftItemsTool`, `registerInteractTool`, `registerBuildTool`).
- [x] 1.4 Remove macro-based tool registrations (`registerCraftMacroTool`, `registerInteractBlockMacroTool`).

## 2. Implement Unified Interaction Tool

- [x] 2.1 Create `registerInteractTool` in `packages/mc-mcp-server/src/tools/interact.ts` that implements the unified polymorphic schema.
- [x] 2.2 Implement "dig" action logic within the unified tool.
- [x] 2.3 Implement "place" action logic within the unified tool.
- [x] 2.4 Implement "craft" action logic within the unified tool.
- [x] 2.5 Implement "use" action logic within the unified tool.
- [x] 2.6 Register the new unified `interact` tool in `McpHttpServer`.

## 3. Update Agent Controller and Loop

- [x] 3.1 Update `AgentLoop` to handle bot connection/reconnection automatically before starting the planning phase.
- [x] 3.2 Implement automatic observation sensing in the `AgentLoop`'s perceive phase using internal helper methods.
- [x] 3.3 Update `LlmClient` to include the automatically sensed observation in the system or user prompt.
- [x] 3.4 Ensure `bot_status` information is always available and injected into the LLM context.
- [x] 3.5 Remove tool call logic for observations from the planning loop.

## 4. Verification and Testing

- [x] 4.1 Update agent loop tests to verify automatic observation injection.
- [x] 4.2 Update MCP server tests to verify the unified `interact` tool functionality.
- [x] 4.3 Verify that lifecycle tools are no longer present in the discovered tool list.
- [x] 4.4 Run a full "gather wood" end-to-end test with the new simplified interface.
