## 1. Parameter Renames (BREAKING)

- [x] 1.1 Rename `level` to `enchantmentSlot` in `interact.ts` enchant action schema and handler code
- [x] 1.2 Rename `type` to `blockType` in `gather_materials.ts` schema and handler code
- [x] 1.3 Rename `isCoordinate` to `isCoordinateTarget` in `reposition.ts` schema and handler code

## 2. Add Missing Parameter Descriptions

- [x] 2.1 Add `.describe()` to all parameters in `combat.ts` (target: entity/player name)
- [x] 2.2 Add `.describe()` to all parameters in `reposition.ts` (target format, distance unit/meaning, isCoordinateTarget flag)
- [x] 2.3 Add `.describe()` to all parameters in `gather_materials.ts` (blockType format, amount range)
- [x] 2.4 Add `.describe()` to parameters in `interact.ts` that lack descriptions (deposit/withdraw amount, trade_index, eat item, target descriptions per action)
- [x] 2.5 Add `.describe()` to `send_chat` message parameter with format guidance

## 3. Restructure `interact` Tool Description

- [x] 3.1 Rewrite `interact` tool description to use structured action-by-action format with section headers
- [x] 3.2 Add implicit-behavior documentation to `interact` description: place requires solid block below, craft auto-finds table within 6 blocks, fish requires fishing rod and catches once per call

## 4. Add Implicit-Behavior Docs to Other Tools

- [x] 4.1 Add search-radius documentation (64 blocks) to `gather_materials` description
- [x] 4.2 Add pathfind-and-attack behavior documentation to `combat` description
- [x] 4.3 Add distance-unit documentation to `reposition` description

## 5. Standardize Zod Schema Style

- [x] 5.1 Convert `combat.ts` from shorthand object syntax to `z.object({...})`
- [x] 5.2 Convert `gather_materials.ts` from shorthand object syntax to `z.object({...})`

## 6. Validation

- [x] 6.1 Run `pnpm typecheck` to verify no type errors after renames
- [x] 6.2 Run `pnpm lint` to verify style compliance
- [x] 6.3 Run `pnpm test` to verify all existing tests pass with renamed parameters