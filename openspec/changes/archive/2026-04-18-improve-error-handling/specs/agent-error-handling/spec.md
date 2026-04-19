## ADDED Requirements

### Requirement: Action history tracking
The agent controller loop SHALL maintain a history of the last 10 tool execution requests and their corresponding responses to detect repeating sequences or identical failing requests.

#### Scenario: Agent repetitively fails opening a door
- **WHEN** the agent attempts to "open a door" at coordinates `(10, 60, -10)` and fails three consecutive times receiving an error response
- **THEN** the system logs this history indicating an identical stalled sequence of requests.

### Requirement: Stall detection circuit breaker and hint injection
When a single specific tool call repeats identical arguments causing successive failures, the agent controller loop MUST intercept the context cycle to provide a structural hint prompting a reflection or deviation.

#### Scenario: Stalled agent is given an explicit contextual hint
- **WHEN** the historical tool call tracker registers 3 identical requests leading to 3 identical or comparable error results consecutively
- **THEN** the engine inserts a system prompt equivalent to "You have failed executing this specific action three times. Rethink your plan and consider using a different tool or obtaining more info" prior to the next LLM generation cycle.