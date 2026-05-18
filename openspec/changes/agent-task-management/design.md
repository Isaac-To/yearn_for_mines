## Context

The current `AgentLoop` takes a `goal` string and runs a loop of perceive-plan-execute-verify. While effective for simple goals, complex tasks (e.g., "Build a house") are difficult for the LLM to manage solely through conversation history. The agent often loses track of its progress or fails to decompose the goal into actionable steps.

## Goals / Non-Goals

**Goals:**
- Provide a structured way for the agent to track progress through sub-tasks.
- Allow the agent to dynamically decompose goals into smaller pieces.
- Support nested sub-tasks (recursion).
- Expose task status (done, incomplete) to the LLM and potentially the UI.
- Minimize changes to the core LLM planning logic while providing more structure.

**Non-Goals:**
- External task persistence (for now, task state is tied to the `AgentLoop` instance).
- Multi-agent task coordination.
- Auto-generation of tasks by the system (the agent should be responsible for its own planning).

## Decisions

### 1. Internal State vs. MCP Tools
We will use a combination of internal state in `AgentLoop` and a new set of "virtual" tools.
- **Rationale**: While we could implement task management as a separate MCP server, keeping it in `AgentLoop` allows for tight integration with the conversation context and loop state without network overhead. The tools will be "virtual" in that they are handled directly by the `AgentLoop` class before/during the `execute` phase, or we can register them with the existing `McpClient`.

### 2. Task List Schema
Tasks will be structured as a tree.
```typescript
interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subtasks: Task[];
}
```
- **Rationale**: Nested sub-tasks allow the agent to break down "bite-sized" pieces even further if they turn out to be complex.

### 3. Toolset for Task Management
The agent will have access to:
- `add_task(description, parentId?)`: Adds a new task.
- `update_task_status(id, status)`: Updates status (done, incomplete, etc.).
- `get_task_list()`: Returns the current tree (though we will likely inject this automatically).

### 4. Automatic Context Injection
The current task list will be automatically appended to every "user" prompt (observation) sent to the LLM.
- **Rationale**: This ensures the agent is always aware of its plan without needing to explicitly call `get_task_list`.

### 5. Logging and Visibility
Task transitions and state updates will be logged with a specific prefix (e.g., `[TASK]`) to make them easily discoverable in the agent logs.
- **Rationale**: High visibility in logs helps developers and users understand the agent's current focus and progress without needing a full UI.

## Risks / Trade-offs

- **[Risk] Context Bloat** → The task list might grow large, consuming tokens. **Mitigation**: Implement truncation or summary for completed tasks if the list exceeds a certain size.
- **[Risk] Agent Hallucination** → The agent might try to mark tasks as done without actually performing the work. **Mitigation**: The system prompt will emphasize that tasks should only be marked complete after verification.
- **[Risk] Sync Issues** → Task state might get out of sync with conversation history if retries or alternative approaches are used. **Mitigation**: Ensure task updates are processed as part of the tool execution flow.
