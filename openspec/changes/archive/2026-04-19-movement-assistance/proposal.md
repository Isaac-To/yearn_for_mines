## Why

Our agents currently struggle to navigate complex terrain because they cannot reliably mine basic blocks to make paths or place blocks to climb over obstacles or pillar upward. Having basic block breaking and placing capabilities mapped to movement maneuvers is critical for unblocking pathing and exploration. We need this now because many generated environments consist of difficult terrain that stops agents in their tracks.

## What Changes

- Introduce capability for the agent to use equipment/tools to mine basic, soft materials (dirt, stone, wood, leaves) when their path is blocked horizontally.
- Introduce capability for the agent to place blocks (dirt, cobble, etc.) below them to pillar up, or in front of them to build basic bridges or staircases to overcome vertical obstacles or gaps.
- Integrate these abilities tightly with the existing movement or action logic so that when a pathing failure occurs, the agent can attempt to carve or build a path.
- The execution relies on providing new MCP tools or adjusting existing ones to handle block manipulation as movement assistance.

## Capabilities

### New Capabilities
- `terrain-manipulation-movement`: The ability to mine obstructing blocks and place blocks for bridges/stairs when pathfinding fails.

### Modified Capabilities
- `observation-pipeline`: May need slight updates to report block types in the immediate surroundings to decide if they are breakable or placeable.

## Impact

- **Bot Action Controller**: Will require new tools for precise block breaking and placing.
- **Agent Loop**: Needs logic to trigger these tools when blocked.
- **Inventory Management**: Agent must be aware of having usable blocks for placing or appropriate tools for mining.