# AGENT.md

This file documents best coding practices for the yearn_for_mines repository. All contributors should follow these guidelines to maintain code quality, consistency, and testability.

## File Size Constraints

**Maximum file length: 500 lines**

- Keep files focused on a single responsibility
- When a file approaches 500 lines, refactor into smaller modules
- Utility files or constants-only files may be exceptions if they serve as a shared registry
- Use this guideline to enforce modularity and improve readability

## Code Organization Principles

### Module Structure
- One primary export per file (or a cohesive set of related exports)
- Related functionality grouped into subdirectories (e.g., `tools/`, `types/`, `utils/`)
- Clear naming: file names should reflect their purpose (`agent-loop.ts`, `mcp-client.ts`, `validation.ts`)
- Barrel exports (index.ts) for public APIs; avoid deep imports from internals

### Dependency Hygiene
- No circular dependencies between modules
- Respect the dependency graph: `shared` → `mc-mcp-server`, `agent`, `web-ui`
- Import only what you use; remove unused imports before committing
- Prefer explicit imports over star imports (`import { foo } from 'module'` not `import * as all`)

## Type Safety Standards

### TypeScript Configuration
- **Strict mode enabled** (`strict: true` in tsconfig.json)
- No `any` types — use proper TypeScript inference or explicit types
- Discriminated unions for error handling, not boolean flags
- Use `readonly` for immutable data structures

### Runtime Validation
- Use Zod for all external inputs (API payloads, environment variables, user data)
- Define validation schemas in `packages/shared/src/types/`
- Parse at API boundaries; trust internal types after validation
- Example pattern:
  ```typescript
  const inputSchema = z.object({ goal: z.string(), maxSteps: z.number() });
  const result = inputSchema.safeParse(input);
  if (!result.success) return { content: [...], isError: true };
  ```

### Return Type Consistency
- MCP tools return `{ content: ContentBlock[], isError: boolean }`
- Never throw exceptions in tool handlers; use the `isError` field
- Make error messages user-facing: be specific about what failed

## Testing Requirements

### Coverage Threshold: 90% (All Metrics)
- **Lines**: 90% of all code lines must be executed
- **Functions**: 90% of all functions must be called
- **Branches**: 90% of all conditional paths must be tested
- **Statements**: 90% of all statements must be executed

### Test Organization
- Co-locate tests with source: `src/__tests__/` or alongside as `*.test.ts`
- Use descriptive test names that explain the behavior tested
- One test file per source file (with rare exceptions for tightly coupled modules)
- Organize tests with describe blocks by functionality

### Test Quality
- **Unit tests** for pure functions, validators, utilities
- **Integration tests** for workflows (agent loop steps, MCP client interactions)
- **Avoid mocking internals** — mock only external dependencies (HTTP, file I/O, LLM)
- Use fixtures and helpers to reduce test duplication
- Example:
  ```typescript
  describe('parseUserInput', () => {
    it('validates goal string and max steps', () => {
      const result = parseUserInput({ goal: 'mine diamonds', maxSteps: 100 });
      expect(result).toHaveProperty('goal', 'mine diamonds');
    });
    it('returns error for invalid input', () => {
      const result = parseUserInput({ goal: '', maxSteps: -1 });
      expect(result.isError).toBe(true);
    });
  });
  ```

## Error Handling Patterns

### Never Throw in Tool Handlers
- Always return `{ content: [...], isError: true }` for failures
- Include a human-readable error message in the content
- Log errors for debugging, but don't expose stack traces to users

### Discriminated Unions for Type-Safe Errors
- Use TypeScript unions over boolean flags
- Example:
  ```typescript
  type Result<T> = { ok: true; value: T } | { ok: false; error: string };
  ```

### Graceful Degradation
- Tool calls have up to 3 retries before trying an alternative approach
- Provide fallback strategies when operations fail
- Report failures clearly so the LLM can adjust its strategy

## Code Style and Conventions

### ES Modules (No CommonJS)
- All packages use `"type": "module"` in package.json
- Use `module: Node16` in tsconfig.json for resolution
- Always use .ts/.js extensions in import paths

### Naming Conventions
- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, classes
- `UPPER_SNAKE_CASE` for constants
- Prefix booleans with `is` or `has` (e.g., `isLoading`, `hasError`)
- Private members may use underscore prefix (_privateMethod)

### Formatting
- Use ESLint configuration provided in `eslint.config.js`
- Run `pnpm lint` before committing
- No manual formatting disputes — trust the linter

### Comments and Documentation
- Document why (not what) the code does
- Use JSDoc for public APIs: functions, exports, complex types
- Keep comments concise and up-to-date
- Example:
  ```typescript
  /**
   * Retries a tool call up to 3 times with exponential backoff.
   * Falls back to alternative approach if all retries fail.
   * @param toolCall - The MCP tool to invoke
   * @returns Result of successful call or error object
   */
  ```

## Commit Guidelines

### Message Format
- **First line**: Concise summary (50 chars max), imperative mood
- **Blank line**, then body with context and reasoning
- Example:
  ```
  Add retry logic with exponential backoff for tool calls
  
  Tool invocations can be transient failures due to network or
  Minecraft lag. Implement up to 3 retries with 100ms base delay
  to improve reliability. Switch to alternative approach if all
  retries fail.
  ```

### Commit Practices
- Commit regularly during development (aim for logical, reviewable units)
- No AI authorship markers (`Co-Authored-By` clauses not permitted)
- Include relevant issue or spec references in commit body
- Run tests and linter before committing

## Performance Considerations

### Avoid Premature Abstractions
- Write three similar implementations before abstracting to a helper
- Prefer explicit code over generic abstractions
- Document why an abstraction exists (not just what it does)

### LLM Integration
- Batch related observations to reduce token overhead
- Cache immutable data (terrain maps, structural layouts)
- Stream long-running operations to provide incremental feedback

### Memory Management
- MemPalace stores long-term learnings; use it for facts that outlive a session
- Clear session-local caches between major phases (planning, exploration, execution)
- Profile memory usage for agent loop iterations

## Build and Validation Commands

```bash
# Verify everything before pushing
pnpm typecheck    # Catch type errors early
pnpm lint         # Enforce code style
pnpm test         # Run all tests with 90% coverage threshold
pnpm build        # Ensure all packages build successfully

# Individual package validation
pnpm --filter @yearn-for-mines/agent run test     # Test one package
pnpm --filter @yearn-for-mines/shared run build   # Build one package
```

## Review Checklist

Before submitting a PR or merging code:

- [ ] File size under 500 lines (refactor if needed)
- [ ] Test coverage meets 90% threshold (all metrics)
- [ ] No `any` types in TypeScript code
- [ ] No unused imports or exports
- [ ] Error handling uses `{ isError: boolean }` pattern
- [ ] All external inputs validated with Zod
- [ ] ESLint and TypeScript checks pass
- [ ] Commit messages are descriptive
- [ ] New public APIs documented with JSDoc

## Common Pitfalls

### ❌ Don't
- Throw errors in MCP tool handlers
- Use `any` as a type
- Commit files over 500 lines
- Skip test coverage for "simple" code
- Mix absolute and relative imports inconsistently
- Leave unused imports in the codebase
- Use star imports in production code

### ✅ Do
- Return `{ content: [...], isError: true }` for failures
- Validate all external inputs with Zod
- Split large files into focused modules
- Test both happy path and error cases
- Use discriminated unions for type safety
- Clean up imports during development
- Name imports explicitly

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zod Documentation](https://zod.dev/)
- [Vitest Guide](https://vitest.dev/)
- [ESLint Configuration](./eslint.config.js)
- [Base TypeScript Config](./tsconfig.base.json)
