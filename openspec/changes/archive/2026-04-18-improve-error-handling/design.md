## Context

Presently, the agent executes tools returned by the LLM and blindly assumes that providing raw exception or textual error messages directly back into the context window will be sufficient for recovery. In practice, models often stall, retrying the exact same parameters endlessly or getting stuck in a loop. Improving the agent logic to track recent failures, detect duplicate failing actions, and inject specific meta-instructions into the prompt ("You seem to be stuck. Please consider a different approach") is essential for autonomous progress.

## Goals / Non-Goals

**Goals:**
- Provide the LLM with structured, semantic feedback about failures instead of untyped stack traces.
- Detect exact or highly similar repeated tool calls that result in errors across consecutive turns.
- Provide a circuit-breaking prompt injection when stall conditions are met.

**Non-Goals:**
- Completely overhauling the underlying Minecraft mod or mineflayer algorithms.
- Complex reinforcement learning. We want a simple heuristical stall-breaker.

## Decisions

- **Error Format Standardization:** We will enforce that any `errorResult` returned from the MCP server includes a human-readable hint (where possible) and avoids dumping huge unparseable raw unhandled rejections that consume context space unnecessarily without providing semantic value to the LLM.
- **Stall Detection Map:** The `agent-loop` will maintain a short-term memory array or counter of the last `N` tool calls and their results. If it detects `>3` successive tool calls with identical arguments resulting in an error, it intercepts the next round and forces an injected message prompting reflection.
- **Circuit Breaker:** If an agent explicitly retries `>5` times and still fails, the agent loop itself may elect to terminate the specific goal sequence or force heavily generalized exploration actions.

## Risks / Trade-offs

- **Risk:** Agents getting interrupted too early by the stall detector when they actually just needed to retry a flaky environmental action (e.g. failing to open a door due to momentary lag).
  - Mitigation: Set the repetition threshold to a conservative number (e.g. 3-4 identical consecutive failures) and ensure the injected prompt encourages the LLM to decide whether to try again differently or abort, rather than hard-aborting automatically.