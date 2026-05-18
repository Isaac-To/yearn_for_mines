## 1. Type Definitions and Shared Schemas

- [x] 1.1 Define `Task` and `TaskStatus` types in `packages/shared/src/types/agent.ts`
- [x] 1.2 Update `AgentStep` in `packages/agent/src/agent-loop.ts` to include the task list state

## 2. Core Task Management Logic

- [x] 2.1 Implement `TaskManager` class or internal state in `AgentLoop` to handle CRUD operations on tasks
- [x] 2.2 Implement `add_task`, `update_task_status`, and `get_task_list` virtual tool handlers in `AgentLoop`
- [x] 2.3 Implement task list serialization/formatting for injection into LLM prompts
- [x] 2.4 Add structured logging for task operations (creation, status updates) with clear visual indicators in the console

## 3. Agent Loop Integration

- [x] 3.1 Register task management virtual tools so the LLM can "discover" them
- [x] 3.2 Update `AgentLoop.plan` to automatically inject the formatted task list into the prompt
- [x] 3.3 Update `AgentLoop.executeToolCall` to route task management tools to the local virtual handlers

## 4. Prompt Engineering

- [x] 4.1 Update system prompt template (or how it's formatted in `LlmClient`) to instruct the agent on how to use the task management tools effectively

## 5. UI Updates (Optional but recommended)

- [x] 5.1 Update `packages/web-ui` to listen for task list updates from the agent and display them in the frontend

## 6. Verification and Tests

- [x] 6.1 Add unit tests for `TaskManager` logic
- [x] 6.2 Add integration tests in `packages/agent/src/__tests__/agent-loop.test.ts` verifying the agent can create and complete tasks
