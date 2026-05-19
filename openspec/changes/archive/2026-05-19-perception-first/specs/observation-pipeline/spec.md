## MODIFIED Requirements

### Requirement: Text observation formatter produces comprehensive world state
The observation pipeline SHALL format raw Minecraft world data into a human-readable text observation that includes everything a player would see and know on screen. The `observe` MCP tool and the agent loop perceive phase SHALL both consume this pipeline to produce on-demand observations, not only tool-result side-effects.

#### Scenario: Full world state observation
- **WHEN** the agent requests a text observation (via `observe` tool or agent loop perceive phase)
- **THEN** the pipeline SHALL produce a structured text block containing: position (x, y, z, yaw, pitch), health/food/saturation/oxygen, experience level and progress, game mode, dimension, biome, weather (rain/thunder), time of day (sunrise/day/noon/sunset/night/midnight), held item (name, count, durability/max_durability, enchantments), armor (helmet, chestplate, leggings, boots), active status effects (name, amplifier, remaining ticks), hotbar contents (9 slots), full inventory summary, nearby blocks within 16 blocks (name, position, diggability), nearby entities within 32 blocks (type, name, position, distance, hostility, health, equipment), nearby dropped items within 16 blocks (name, count, position), light level at bot position, ground distance below bot, attack cooldown state, and any block being actively dug with break progress

#### Scenario: Minimal observation on spawn
- **WHEN** the bot has just spawned and has not moved
- **THEN** the pipeline SHALL still produce a valid observation with spawn position, initial state, and any immediately visible blocks/entities

#### Scenario: Observation truncation for context limits
- **WHEN** the full observation exceeds a configurable token limit (default: 2000 tokens)
- **THEN** the pipeline SHALL truncate the least important sections (distant entities, redundant block listings) while preserving position, health, inventory, nearby blocks, and active status effects

#### Scenario: On-demand observation via MCP tool
- **WHEN** the `observe` MCP tool is called
- **THEN** the pipeline SHALL build and format a fresh observation using the current bot state
- **AND** SHALL return the formatted observation text via `textResult()`
- **AND** SHALL flush the event buffer so events are not duplicated in subsequent observations

#### Scenario: Combat-relevant observation
- **WHEN** hostile mobs are nearby
- **THEN** the observation SHALL prioritize and highlight hostile entities with their distance, health, and attack readiness — mirroring the threat awareness a player has when danger is near

#### Scenario: Environmental observation
- **WHEN** the agent is in a dangerous environment (near lava, high altitude, dark area)
- **THEN** the observation SHALL include environmental hazard warnings: nearby lava, water, fire, fall distance, light level, and whether hostile mobs could spawn (light level < 7)