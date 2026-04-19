## 1. Modify MCP Tools

- [x] 1.1 Update `navigate_to` and related movement tools to accept the `allowTerrainManipulation` boolean flag.
- [x] 1.2 Modify tool logic to translate the `allowTerrainManipulation` flag into `mineflayer-pathfinder`'s `canDig` and `canPlace` settings.
- [x] 1.3 Add logic in movement tools to verify if `allowTerrainManipulation` is set and return errors when pathfinding fails due to missing blocks or appropriate tools in inventory.

## 2. Testing and Validation

- [x] 2.1 Add unit tests for `navigate_to` parsing the new `allowTerrainManipulation` flag.
- [x] 2.2 Add integration or mock tests to simulate pathfinding failure when agent lacks correct tools/blocks.