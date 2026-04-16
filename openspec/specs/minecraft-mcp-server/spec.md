## Requirements

### Requirement: MCP server exposes Mineflayer bot lifecycle management
The system SHALL provide MCP tools for managing the bot's connection lifecycle including creating, connecting, disconnecting, and respawning the bot.

#### Scenario: Bot connects to Minecraft server
- **WHEN** the `bot_connect` tool is called with valid host, port, username, and version
- **THEN** the server SHALL create a Mineflayer bot instance, connect to the specified Minecraft server, and return a success response with the bot's username and spawn position

#### Scenario: Bot disconnects gracefully
- **WHEN** the `bot_disconnect` tool is called while the bot is connected
- **THEN** the server SHALL disconnect the bot from the Minecraft server and clean up resources

#### Scenario: Bot respawns after death
- **WHEN** the `bot_respawn` tool is called after the bot has died
- **THEN** the server SHALL respawn the bot at the world spawn point

#### Scenario: Bot connection fails
- **WHEN** the `bot_connect` tool is called with an unreachable server
- **THEN** the server SHALL return an error response with a descriptive message and `isError: true`

### Requirement: MCP server exposes observation tools
The system SHALL provide tools for the agent to perceive the full range of information a Minecraft player would be aware of: position, health, hunger, oxygen, experience, game mode, biome, weather, time of day, held item, armor and equipment, active status effects, inventory, nearby blocks with context, nearby entities with hostility info, nearby dropped items, light levels, and fall risk assessment.

#### Scenario: Agent observes full world state
- **WHEN** the `observe` tool is called
- **THEN** the server SHALL return a structured observation containing: position (x, y, z, yaw, pitch), health (0-20), food level (0-20), food saturation, oxygen level (0-20), experience level and progress, game mode, biome, dimension, weather (isRaining, isThundering), time of day (sunrise/day/noon/sunset/night/midnight), whether it is day, moon phase, held item (name, count, durability), armor slots (helmet, chestplate, leggings, boots), active status effects (name, amplifier, duration), inventory summary, nearby blocks (within configured radius, with name, position, and diggability), nearby entities (within 32 blocks, with type, name, position, distance, and hostility), nearby dropped items (within 16 blocks), light level at bot position, and ground distance (fall risk)

#### Scenario: Agent finds specific block types
- **WHEN** the `find_block` tool is called with a block type name (e.g., "oak_log")
- **THEN** the server SHALL return the positions of matching blocks within a configurable search radius, limited to a configurable maximum count

#### Scenario: Agent finds specific entity types
- **WHEN** the `find_entity` tool is called with an entity type name (e.g., "zombie")
- **THEN** the server SHALL return the positions and details of matching entities within range, including health, equipment, and hostility

#### Scenario: Agent gets inventory contents
- **WHEN** the `get_inventory` tool is called
- **THEN** the server SHALL return a list of all items in the bot's inventory with name, display name, count, slot, durability (if applicable), maximum durability, enchantments, and stack size

#### Scenario: Agent gets bot position
- **WHEN** the `get_position` tool is called
- **THEN** the server SHALL return the bot's current x, y, z coordinates and yaw/pitch orientation

#### Scenario: Agent checks what can be crafted
- **WHEN** the `get_craftable` tool is called
- **THEN** the server SHALL return a list of items the bot can currently craft given its inventory contents, including which items require a crafting table vs the 2x2 inventory grid

#### Scenario: Agent gets tool effectiveness info
- **WHEN** the `get_tool_effectiveness` tool is called with a block type name
- **THEN** the server SHALL return which tools in the bot's inventory are effective against that block, their current durability, and the estimated dig time with each tool

#### Scenario: Agent gets nearby dropped items
- **WHEN** the `observe` or `get_nearby_items` tool is called
- **THEN** the server SHALL return dropped item entities within 16 blocks, including item name, count, and position

### Requirement: MCP server exposes movement tools
The system SHALL provide tools for the agent to navigate the world including pathfinding, looking, and direct movement control.

#### Scenario: Agent pathfinds to coordinates
- **WHEN** the `pathfind_to` tool is called with target x, y, z coordinates
- **THEN** the server SHALL use mineflayer-pathfinder to navigate the bot to within 1 block of the target position and return success with final coordinates

#### Scenario: Agent pathfinds near a block type
- **WHEN** the `pathfind_to` tool is called with a block type name
- **THEN** the server SHALL find the nearest block of that type and pathfind to within reach distance of it

#### Scenario: Agent looks at a position
- **WHEN** the `look_at` tool is called with x, y, z coordinates
- **THEN** the server SHALL orient the bot to face the specified position

#### Scenario: Pathfinding is interrupted
- **WHEN** pathfinding is in progress and a new pathfinding request is made
- **THEN** the server SHALL cancel the current path and start the new one

#### Scenario: Pathfinding fails to reach target
- **WHEN** pathfinding cannot find a valid path to the target
- **THEN** the server SHALL return an error with the closest reachable point and the reason for failure

### Requirement: MCP server exposes block interaction tools
The system SHALL provide tools for the agent to dig blocks and place blocks in the world.

#### Scenario: Agent digs a block
- **WHEN** the `dig_block` tool is called with x, y, z coordinates of a diggable block
- **THEN** the server SHALL navigate to the block if needed, equip the best available tool, dig the block, and return success with the block name and position

#### Scenario: Agent tries to dig an undiggable block
- **WHEN** the `dig_block` tool is called for a bedrock block or other undiggable block
- **THEN** the server SHALL return an error with `isError: true` and a message explaining why the block cannot be dug

#### Scenario: Agent places a block
- **WHEN** the `place_block` tool is called with a block type name and target position
- **THEN** the server SHALL find the block in inventory, navigate adjacent to the target, and place it, returning success with the placed position

#### Scenario: Agent tries to place a block not in inventory
- **WHEN** the `place_block` tool is called with a block type not in the bot's inventory
- **THEN** the server SHALL return an error listing what blocks are available in inventory

### Requirement: MCP server exposes crafting tools
The system SHALL provide tools for the agent to craft items using crafting tables and the 2x2 inventory grid.

#### Scenario: Agent crafts an item with inventory grid
- **WHEN** the `craft_item` tool is called with an item name that can be crafted without a crafting table (e.g., "oak_planks")
- **THEN** the server SHALL find the recipe, verify materials are available, craft the item, and return the result with item name and quantity crafted

#### Scenario: Agent crafts an item with a crafting table
- **WHEN** the `craft_item` tool is called with an item name that requires a crafting table (e.g., "wooden_pickaxe")
- **THEN** the server SHALL find a nearby crafting table or pathfind to one, open it, craft the item, and return the result

#### Scenario: Agent crafts with insufficient materials
- **WHEN** the `craft_item` tool is called but required materials are missing
- **THEN** the server SHALL return an error listing missing materials and their required quantities

### Requirement: MCP server exposes inventory management tools
The system SHALL provide tools for the agent to equip items, drop items, and use items.

#### Scenario: Agent equips an item
- **WHEN** the `equip_item` tool is called with an item name and destination (hand, head, torso, legs, feet, off-hand)
- **THEN** the server SHALL find the item in inventory and equip it to the specified slot

#### Scenario: Agent drops an item
- **WHEN** the `drop_item` tool is called with an item name and optional count
- **THEN** the server SHALL toss the specified items from the bot's inventory onto the ground

#### Scenario: Agent uses a held item
- **WHEN** the `use_item` tool is called
- **THEN** the server SHALL activate the currently held item (eat food, throw egg, etc.)

### Requirement: MCP server exposes chat and communication tools
The system SHALL provide tools for the agent to send and receive chat messages, capturing all the communication a player would see on screen.

#### Scenario: Agent sends a chat message
- **WHEN** the `chat` tool is called with a message string
- **THEN** the server SHALL send the message to the Minecraft server chat

#### Scenario: Agent whispers to a player
- **WHEN** the `whisper` tool is called with a username and message
- **THEN** the server SHALL send a private message to that player

#### Scenario: Agent receives chat messages
- **WHEN** the bot receives a chat message from any player
- **THEN** the server SHALL emit an event with the sender username, message content, and message type (chat, whisper, system, action bar)

#### Scenario: Agent receives death messages
- **WHEN** the bot or another player dies
- **THEN** the server SHALL emit an event with the death message

### Requirement: MCP server exposes visual capture tools
The system SHALL provide tools to capture what a player would see on screen, including screenshots and structured visual data.

#### Scenario: Agent captures a screenshot
- **WHEN** the `screenshot` tool is called
- **THEN** the server SHALL render the bot's view using prismarine-viewer and return a base64-encoded PNG image

#### Scenario: Screenshot capture when viewer is not available
- **WHEN** the `screenshot` tool is called but prismarine-viewer is not initialized
- **THEN** the server SHALL return an error indicating that visual observation is not available

#### Scenario: Agent gets what it is looking at
- **WHEN** the `look_at_block` or `entity_at_cursor` tool is called
- **THEN** the server SHALL return the block or entity the bot is currently looking at, including block name, position, and properties, or entity name, position, health, and equipment — mimicking the crosshair information a player sees

### Requirement: MCP server exposes event subscriptions
The system SHALL provide MCP notifications for real-time events that a player would see on screen, allowing the agent to react to world changes without polling.

#### Scenario: Block change notification
- **WHEN** a block in the bot's vicinity changes (placed, broken, updated)
- **THEN** the server SHALL emit a notification with the block position, old block type, and new block type

#### Scenario: Entity spawn notification
- **WHEN** a new entity enters the bot's loaded chunks
- **THEN** the server SHALL emit a notification with the entity type, name, position, and hostility

#### Scenario: Entity despawn/death notification
- **WHEN** an entity despawns or dies near the bot
- **THEN** the server SHALL emit a notification with the entity type and death cause if available

#### Scenario: Entity movement notification
- **WHEN** a nearby entity moves significantly
- **THEN** the server SHALL emit a notification with the entity ID and new position

#### Scenario: Player health/damage notification
- **WHEN** the bot takes damage or heals
- **THEN** the server SHALL emit a notification with the new health value, damage source, and amount

#### Scenario: Hunger change notification
- **WHEN** the bot's food level changes
- **THEN** the server SHALL emit a notification with the new food level and saturation

#### Scenario: Experience change notification
- **WHEN** the bot gains experience
- **THEN** the server SHALL emit a notification with the new level and progress

#### Scenario: Item pickup notification
- **WHEN** the bot picks up a dropped item
- **THEN** the server SHALL emit a notification with the item name, count, and remaining inventory slot info

#### Scenario: Weather change notification
- **WHEN** it starts or stops raining or thundering
- **THEN** the server SHALL emit a notification with the new weather state

#### Scenario: Sound effect notification
- **WHEN** a sound effect plays near the bot (explosion, door opening, footsteps, mob sounds, etc.)
- **THEN** the server SHALL emit a notification with the sound name, category, position, and volume — providing the audio awareness a player has through sound

#### Scenario: Particle notification
- **WHEN** particles appear near the bot (block breaking particles, smoke, rain splashes, etc.)
- **THEN** the server SHALL emit a notification with the particle type and position — providing the visual particle awareness a player has

### Requirement: MCP server exposes player status HUD tools
The system SHALL provide tools that mirror the heads-up display information a player sees on screen.

#### Scenario: Agent gets full HUD data
- **WHEN** the `get_hud` tool is called
- **THEN** the server SHALL return all on-screen information: health, food, saturation, oxygen, experience level and progress, armor toughness, held item with durability, hotbar contents (9 slots), armor slots, active status effects with remaining duration, boss bar data if visible, scoreboards, and team information

#### Scenario: Agent checks attack readiness
- **WHEN** the `get_attack_cooldown` tool is called
- **THEN** the server SHALL return the attack cooldown progress (0.0-1.0), mimicking the attack indicator a player sees on the crosshair

#### Scenario: Agent gets block breaking progress
- **WHEN** the bot is actively digging a block
- **THEN** the `observe` response SHALL include the block being dug, its position, and the break progress (0.0-1.0), mirroring the crack animation a player sees

### Requirement: MCP tools use Zod input and output schemas
Every MCP tool SHALL define input schemas using Zod for type-safe validation and output schemas for structured responses.

#### Scenario: Tool receives valid input
- **WHEN** a tool is called with parameters matching its Zod input schema
- **THEN** the parameters SHALL be validated and passed to the handler

#### Scenario: Tool receives invalid input
- **WHEN** a tool is called with parameters that do not match the Zod input schema
- **THEN** the server SHALL return a validation error with details about which fields failed validation

### Requirement: MCP server uses Streamable HTTP transport
The server SHALL expose MCP tools via Streamable HTTP transport to allow multiple clients (agent, web UI) to connect simultaneously.

#### Scenario: Client connects via Streamable HTTP
- **WHEN** a client sends an HTTP POST to the MCP endpoint
- **THEN** the server SHALL process the request and respond according to the MCP Streamable HTTP transport specification

#### Scenario: Multiple clients connect simultaneously
- **WHEN** both the agent controller and web debug UI connect to the MCP server
- **THEN** both clients SHALL receive tool call results and notifications independently

### Requirement: MCP server provides bot status resource
The server SHALL expose an MCP resource providing real-time bot status information.

#### Scenario: Client reads bot status resource
- **WHEN** a client requests the `bot://status` resource
- **THEN** the server SHALL return the bot's current state including connection status, position, health, food, inventory summary, and held item