## 1. Implement String Distance Matching Utility

- [x] 1.1 Create `findClosestMatch` utility in `packages/mc-mcp-server/src/utils/` to calculate Levenshtein distance between strings.
- [x] 1.2 Write tests for `findClosestMatch` to ensure it returns the top X matches accurately.

## 2. Update Minecraft MCP Tools

- [x] 2.1 Update `gather_materials` handler in `mc-mcp-server/src/tools/` to catch "Unknown block type" errors.
- [x] 2.2 Calculate suggestions using `findClosestMatch` from the mineflayer blocks/items registry when the error is caught in `gather_materials`.
- [x] 2.3 Modify the returned `isError: true` message in `gather_materials` to include suggestions (e.g., "...Did you mean...").
- [x] 2.4 Apply the same error catching and suggestion logic to other critical item/block tools like `interact`, `reposition`, or `craft_items`.

## 3. Testing and Verification

- [x] 3.1 Write unit tests for updated handlers injecting simulated invalid inputs to verify enriched error messages.
- [x] 3.2 Run the full agent loop locally and simulate an LLM hallucination for block/item name to verify it correctly self-corrects based on the suggestion.