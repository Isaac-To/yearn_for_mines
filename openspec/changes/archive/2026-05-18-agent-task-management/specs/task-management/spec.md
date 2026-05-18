## ADDED Requirements

### Requirement: Agent manages sub-tasks for complex goals
The agent SHALL maintain a task list to decompose the primary goal into smaller, manageable sub-tasks. It MUST track the status of each task (pending, in_progress, completed, failed).

#### Scenario: Decomposing a complex goal
- **WHEN** the agent receives a complex goal (e.g., "Build a stone tower")
- **THEN** the agent SHALL use the `add_task` tool to create sub-tasks representing the individual steps needed to achieve the goal

#### Scenario: Marking a task as complete
- **WHEN** the agent has verified that the actions for a specific sub-task are successfully finished
- **THEN** the agent SHALL use the `update_task_status` tool to mark the task as "completed"

#### Scenario: Marking a task as failed
- **WHEN** the agent has exhausted all retries or determined a sub-task is impossible
- **THEN** the agent SHALL mark the task as "failed" and create a new task representing an alternative approach

#### Scenario: Sub-task recursion
- **WHEN** a sub-task is identified as too complex for a single step
- **THEN** the agent SHALL create sub-tasks for that specific sub-task, effectively creating a task tree

### Requirement: Task list is automatically injected into planning context
The agent controller SHALL automatically append the current task list and its statuses to every observation prompt sent to the LLM.

#### Scenario: Planning with task context
- **WHEN** the agent begins the planning phase
- **THEN** the LLM SHALL receive the current task list as part of the observation context, allowing it to maintain focus on the current step in the plan

### Requirement: Agent loop respects task hierarchy
The agent loop SHALL ensure that tasks are executed in a logical order according to the agent's plan and task list.

#### Scenario: Following the task list
- **WHEN** multiple tasks are pending
- **THEN** the agent SHALL prioritize the task it identifies as the next logical step and update its status to `in_progress`
