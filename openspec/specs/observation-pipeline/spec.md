## Requirements

### Requirement: Text observation formatter produces comprehensive world state
The observation pipeline SHALL format raw Minecraft world data into a human-readable text observation that includes everything a player would see and know on screen.

#### Scenario: Full world state observation
- **WHEN** the agent requests a text observation
- **THEN** the pipeline SHALL produce a structured text block containing: position (x, y, z, yaw, pitch), health/food/saturation/oxygen, experience level and progress, game mode, dimension, biome, weather (rain/thunder), time of day (sunrise/day/noon/sunset/night/midnight), held item (name, count, durability/max_durability, enchantments), armor (helmet, chestplate, leggings, boots), active status effects (name, amplifier, remaining ticks), hotbar contents (9 slots), full inventory summary, nearby blocks within 16 blocks (name, position, diggability), nearby entities within 32 blocks (type, name, position, distance, hostility, health, equipment), nearby dropped items within 16 blocks (name, count, position), light level at bot position, ground distance below bot, attack cooldown state, and any block being actively dug with break progress

#### Scenario: Minimal observation on spawn
- **WHEN** the bot has just spawned and has not moved
- **THEN** the pipeline SHALL still produce a valid observation with spawn position, initial state, and any immediately visible blocks/entities

#### Scenario: Observation truncation for context limits
- **WHEN** the full observation exceeds a configurable token limit (default: 2000 tokens)
- **THEN** the pipeline SHALL truncate the least important sections (distant entities, redundant block listings) while preserving position, health, inventory, nearby blocks, and active status effects

#### Scenario: Combat-relevant observation
- **WHEN** hostile mobs are nearby
- **THEN** the observation SHALL prioritize and highlight hostile entities with their distance, health, and attack readiness — mirroring the threat awareness a player has when danger is near

#### Scenario: Environmental observation
- **WHEN** the agent is in a dangerous environment (near lava, high altitude, dark area)
- **THEN** the observation SHALL include environmental hazard warnings: nearby lava, water, fire, fall distance, light level, and whether hostile mobs could spawn (light level < 7)

### Requirement: VLM screenshot capture from prismarine-viewer
The observation pipeline SHALL capture screenshots of the bot's first-person view using prismarine-viewer when available, providing the visual information a player sees on screen.

#### Scenario: Screenshot capture with viewer active
- **WHEN** prismarine-viewer is initialized and the `screenshot` tool is called
- **THEN** the pipeline SHALL return a base64-encoded PNG image of the bot's current view

#### Scenario: Headless rendering
- **WHEN** the system is running in a headless environment (no display)
- **THEN** the pipeline SHALL use a virtual framebuffer (Xvfb or similar) to render screenshots without a physical display

#### Scenario: Viewer not initialized
- **WHEN** prismarine-viewer is not available or fails to initialize
- **THEN** the `screenshot` tool SHALL return an error indicating VLM is not available, and the agent SHALL continue with text-only observations

### Requirement: Observation data includes full player awareness context
The observation pipeline SHALL enrich raw data with all the context a player would intuitively know from visual and auditory cues.

#### Scenario: Block context enrichment
- **WHEN** the observation includes blocks
- **THEN** each block SHALL include: name, display name, position, diggability, effective tool type, best available tool effectiveness, estimated dig time, and light level at block position

#### Scenario: Entity context enrichment
- **WHEN** the observation includes entities
- **THEN** each entity SHALL include: type (player, hostile_mob, passive_mob, object), name, display name, position, distance from bot, health, max health, held item, armor, hostility (always hostile, neutral, passive), and behavior state (idle, attacking, fleeing) if determinable

#### Scenario: Item context enrichment
- **WHEN** the observation includes dropped items
- **THEN** each dropped item SHALL include: name, display name, count, position, distance from bot, and estimated despawn time

#### Scenario: Inventory context enrichment
- **WHEN** the observation includes inventory
- **THEN** the inventory summary SHALL include: total occupied slots, empty slots, items grouped by type, food items with hunger restoration values, tools with remaining durability percentage, and items that can be crafted with current materials

#### Scenario: Craftability enrichment
- **WHEN** the observation includes inventory data
- **THEN** the pipeline SHALL list items that can be crafted immediately (2x2 grid) and items that can be crafted with a crafting table, based on current inventory contents

#### Scenario: Sound and particle event enrichment
- **WHEN** the agent receives event notifications (sounds, particles, block changes)
- **THEN** the pipeline SHALL incorporate recent events into the next observation, describing what a player would have heard or seen: "You hear a zombie growling nearby to the north" or "You hear an explosion to the east"