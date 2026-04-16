## MODIFIED Requirements

### Requirement: Graceful shutdown
Pressing Ctrl+C SHALL terminate all running services cleanly without leaving orphan processes, and SHALL propagate the signal through `concurrently` to each child process so that each process's own shutdown handler runs.

#### Scenario: Developer presses Ctrl+C
- **WHEN** a developer presses Ctrl+C while `pnpm dev` is running
- **THEN** concurrently propagates SIGINT to all child processes, each child process runs its own shutdown handler, and the command exits cleanly

#### Scenario: One service crashes
- **WHEN** one service exits with a non-zero status code
- **THEN** all other services are terminated (kill-others behavior) and each service's shutdown handler runs

#### Scenario: Shutdown completes within timeout
- **WHEN** all child processes complete their shutdown handlers within 10 seconds
- **THEN** the orchestrator exits cleanly with code 0

#### Scenario: Shutdown times out
- **WHEN** one or more child processes do not complete shutdown within the grace period
- **THEN** the orchestrator forces termination and exits with code 1