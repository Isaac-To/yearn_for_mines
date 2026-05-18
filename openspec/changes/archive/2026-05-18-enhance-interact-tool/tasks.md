## 1. Schema Enhancement

- [x] 1.1 Update `interact` tool Zod schema with detailed descriptions for `use` action.
- [x] 1.2 Add `interactableBlocks` list to `interact.ts` for validation.

## 2. Implementation

- [x] 2.1 Implement `openFurnace` logic for smelting blocks.
- [x] 2.2 Implement `openBrewingStand` logic with type safety fallbacks.
- [x] 2.3 Implement `openContainer` logic for chests, barrels, and shulker boxes.
- [x] 2.4 Ensure generic `activateBlock` is used for mechanical/redstone blocks.

## 3. Cleanup & Verification

- [x] 3.1 Remove invalid `registerLifecycleTools` import in `index.ts`.
- [x] 3.2 Verify build with `pnpm build`.
- [x] 3.3 Verify 90% test coverage for new logic (if feasible in this environment).
