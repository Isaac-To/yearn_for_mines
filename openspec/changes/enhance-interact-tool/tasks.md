## 1. Schema Enhancement

- [ ] 1.1 Update `interact` tool Zod schema with detailed descriptions for `use` action.
- [ ] 1.2 Add `interactableBlocks` list to `interact.ts` for validation.

## 2. Implementation

- [ ] 2.1 Implement `openFurnace` logic for smelting blocks.
- [ ] 2.2 Implement `openBrewingStand` logic with type safety fallbacks.
- [ ] 2.3 Implement `openContainer` logic for chests, barrels, and shulker boxes.
- [ ] 2.4 Ensure generic `activateBlock` is used for mechanical/redstone blocks.

## 3. Cleanup & Verification

- [ ] 3.1 Remove invalid `registerLifecycleTools` import in `index.ts`.
- [ ] 3.2 Verify build with `pnpm build`.
- [ ] 3.3 Verify 90% test coverage for new logic (if feasible in this environment).
