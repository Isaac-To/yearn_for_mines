## Proposal ID: subgoal-planner

### Summary
Replace the flat single-goal agent loop with a reactive sub-goal planner that decomposes high-level goals into a sequence of executable sub-goals, executes them step-by-step, and adapts on failure.

### Research Basis
1. **Voyager** (Wang et al., 2305.16291) introduces an automatic curriculum and skill decomposition — tasks are broken into sub-tasks that progressively build capability. Our agent lacks this entirely.
2. **Optimus-2** (Li et al., 2502.19902) demonstrates that Goal-Observation-Action conditioned policies significantly outperform flat goal-following by explicitly modeling the relationship between what the agent sees and what it should do next in a structured hierarchy.
3. **Parallelized Planning-Acting** (Li et al., 2503.03505) shows that separating planning and acting phases reduces LLM context bloat and improves task completion.

### Current State
- Agent receives a single `goal: string` in AgentLoopConfig
- Each iteration: perceive → plan (one tool call) → execute → verify → remember
- No task decomposition — the LLM has to figure out the entire Minecraft tech tree from scratch in a single context
- Stalled actions are detected (3 identical failures → alternative attempt) but there's no structured progression

### Proposed Change
Add a `SubGoalPlanner` class that:
1. Given a high-level goal and current observation, asks the LLM to decompose into 2-5 ordered sub-goals
2. Each sub-goal is a concrete, verifiable step (e.g. "chop 3 oak_log", "craft crafting_table")
3. The agent executes one sub-goal at a time using the existing perceive→plan→execute loop
4. After each sub-goal, observes the result and either advances to the next sub-goal or re-plans
5. If a sub-goal fails 3 times, re-asks the planner for a revised sub-goal sequence

### Success Criteria
- [ ] Agent with goal "craft a wooden pickaxe" generates sub-goals: gather oak_log → craft oak_planks → craft sticks → craft crafting_table → craft wooden_pickaxe
- [ ] Sub-goals are executed in order, each with its own perceive→plan→execute loop
- [ ] If a sub-goal fails (e.g. "craft wooden_pickaxe" fails because the table isn't placed), the planner adapts
- [ ] All existing tests pass at 90%+ coverage
- [ ] New code has unit tests for sub-goal parsing, planner fallback, and execution flow

### Non-Goals
- Full Voyager-style automatic curriculum (that's iteration 2)
- Skill library with executable code storage (MemPalace already handles this)
- Vision model integration
