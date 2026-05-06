## Design: Sub-Goal Planner

### Overview
Add a `SubGoalPlanner` module in `packages/agent/src/` that wraps the existing `AgentLoop` with a planning layer. The planner decomposes high-level goals into sub-goals and manages execution across them.

### Architecture

```
Agent (entry) → SubGoalPlanner
                 ├─ plan_subgoals(goal, observation) → SubGoal[]
                 ├─ execute_subgoal(subgoal) → { success, observation, error? }
                 │     └─ uses existing AgentLoop loop (single sub-goal iteration)
                 └─ adapt_on_failure(failed_subgoal, context) → SubGoal[]
```

### Data Flow
1. User sets `AGENT_GOAL="craft a wooden pickaxe"`
2. `SubGoalPlanner.plan_subgoals()` calls LLM with system prompt + current observation
3. LLM returns a structured list of 2-5 sub-goals with verification criteria
4. For each sub-goal, `execute_subgoal()` runs the existing perceive→plan→execute loop
5. After execution, `verify_subgoal()` checks if the sub-goal was achieved based on new observation
6. On success → next sub-goal. On repeated failure → re-plan from current state

### SubGoal Interface
```typescript
interface SubGoal {
  id: string;                    // e.g. "sg-1"
  description: string;           // "Gather 3 oak_log"
  verificationCue: string;       // "Inventory contains oak_log >= 3"
  maxIterations: number;         // How many loop iterations to try before giving up
  dependencies?: string[];       // Sub-goal IDs that must complete first
}
```

### Prompt Design
The planner prompt is separate from the execution prompt:
```
You are a Minecraft task planner. Given a high-level goal and the agent's current
state, break the goal into 2-5 concrete sub-goals. Each sub-goal must be:
1. Achievable with the available tools
2. Verifiable by checking the observation (inventory, position, nearby blocks)
3. Logically ordered (prerequisites first)

Current goal: {goal}
Current state: {observation}

Output a JSON array of sub-goals:
[
  { "id": "sg-1", "description": "...", "verificationCue": "...", "maxIterations": 5 },
  ...
]
```

### Integration Points
- `agent-loop.ts` → modify `run()` to accept a sub-goal or flat goal
- No changes to `mc-mcp-server` or `shared` needed
- New file: `packages/agent/src/subgoal-planner.ts`
- New test: `packages/agent/src/__tests__/subgoal-planner.test.ts`

### Error Handling
- Planner LLM call fails → fall back to flat goal execution (current behavior)
- Sub-goal fails after max iterations → re-plan from current state, skip failed goal
- All sub-goals fail → return failure for top-level goal
