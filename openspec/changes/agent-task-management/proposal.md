## Why

Currently, the agent operates in a continuous loop without a structured way to track progress through complex goals. It receives a single high-level goal and must manage all intermediate steps in its conversation history. This leads to several issues:
- Difficulty in planning long-running tasks.
- Lack of visibility for users on what sub-tasks are being worked on.
- Inefficiency in breaking down problems into bite-sized pieces.

Introducing a task management system will allow the agent to decompose goals into smaller, manageable sub-tasks, track their completion status, and adjust its plan dynamically.

## What Changes

- **Task Management State**: Add a task list to the `AgentLoop` to track sub-tasks and their statuses (done, incomplete).
- **Tool-based Task Management**: Introduce MCP tools to allow the agent to create, update, and mark tasks as complete or incomplete.
- **Enhanced Planning**: Update the agent's planning prompt to include the current task list, encouraging it to follow and update its tasks.
- **Recursive Task Breakdown**: Allow the agent to break down tasks into sub-tasks as needed.
- **System Injection**: Automatically inject task list updates into the conversation to keep the agent oriented.

## Capabilities

### New Capabilities
- `task-management`: Provides the agent with tools and internal state to manage a list of tasks and sub-tasks for the current goal.

### Modified Capabilities
- `agent-loop`: Integrate task management into the main agent loop, including observation and planning phases.

## Impact

- `packages/agent/src/agent-loop.ts`: Will need to hold the task list and provide it to the LLM.
- `packages/mc-mcp-server/src/tools/`: New tools for task management might be added here, or a new tool category.
- `packages/shared/src/types/`: Define task and task-list schemas.
- `packages/web-ui/src/`: Update UI to display the agent's current task list.
