import { z } from 'zod';

// Bot connection configuration
export const BotConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(25565),
  username: z.string().default('YearnForMines'),
  version: z.string().default('1.21.4'),
  auth: z.enum(['offline', 'microsoft']).default('offline'),
});

export type BotConfig = z.infer<typeof BotConfigSchema>;

// Bot position and orientation
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  yaw: z.number(),
  pitch: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

// Health and status information
export const HealthStatusSchema = z.object({
  health: z.number().min(0).max(20),
  food: z.number().min(0).max(20),
  foodSaturation: z.number().min(0),
  oxygenLevel: z.number().min(0).max(20),
  experienceLevel: z.number().min(0),
  experienceProgress: z.number().min(0).max(1),
  isSleeping: z.boolean(),
  gameMode: z.enum(['survival', 'creative', 'adventure', 'spectator']),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// Status effect on a player
export const StatusEffectSchema = z.object({
  name: z.string(),
  amplifier: z.number(),
  duration: z.number(),
});

export type StatusEffect = z.infer<typeof StatusEffectSchema>;

// Item in inventory
export const ItemSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  count: z.number().min(0),
  slot: z.number(),
  durability: z.number().optional(),
  maxDurability: z.number().optional(),
  enchantments: z.array(z.object({
    name: z.string(),
    level: z.number(),
  })).optional(),
  stackSize: z.number().optional(),
});

export type Item = z.infer<typeof ItemSchema>;

// Block observation
export const BlockObservationSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  diggable: z.boolean(),
  effectiveTool: z.string().optional(),
  digTimeMs: z.number().optional(),
  lightLevel: z.number().optional(),
});

export type BlockObservation = z.infer<typeof BlockObservationSchema>;

// Entity observation
export const EntityObservationSchema = z.object({
  id: z.number(),
  type: z.enum(['player', 'mob', 'object', 'global', 'other']),
  name: z.string(),
  displayName: z.string(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  distance: z.number(),
  health: z.number().optional(),
  maxHealth: z.number().optional(),
  hostility: z.enum(['always_hostile', 'neutral', 'passive']),
  behaviorState: z.enum(['idle', 'attacking', 'fleeing']).optional(),
  heldItem: z.string().optional(),
  armor: z.array(z.string()).optional(),
});

export type EntityObservation = z.infer<typeof EntityObservationSchema>;

// Dropped item on the ground
export const DroppedItemSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  count: z.number(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  distance: z.number(),
  estimatedDespawnMs: z.number().optional(),
});

export type DroppedItem = z.infer<typeof DroppedItemSchema>;

// Environmental hazard
export const EnvironmentalHazardSchema = z.object({
  type: z.enum(['lava', 'water', 'fire', 'fall_risk', 'cactus', 'void']),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  distance: z.number(),
  severity: z.enum(['low', 'medium', 'high', 'deadly']),
});

export type EnvironmentalHazard = z.infer<typeof EnvironmentalHazardSchema>;

// Weather state
export const WeatherSchema = z.object({
  isRaining: z.boolean(),
  isThundering: z.boolean(),
  rainState: z.number().min(0).max(1),
  thunderState: z.number().min(0).max(1),
});

export type Weather = z.infer<typeof WeatherSchema>;

// Time of day
export const TimeOfDaySchema = z.object({
  time: z.number(),
  timeOfDay: z.number(),
  day: z.boolean(),
  moonPhase: z.number(),
  phase: z.enum(['sunrise', 'day', 'noon', 'sunset', 'night', 'midnight']),
});

export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

// Attack cooldown state
export const AttackCooldownSchema = z.object({
  progress: z.number().min(0).max(1),
  ready: z.boolean(),
});

export type AttackCooldown = z.infer<typeof AttackCooldownSchema>;

// Active dig progress
export const DigProgressSchema = z.object({
  blockName: z.string(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  progress: z.number().min(0).max(1),
});

export type DigProgress = z.infer<typeof DigProgressSchema>;