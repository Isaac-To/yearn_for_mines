import { z } from 'zod';
import {
  PositionSchema,
  HealthStatusSchema,
  StatusEffectSchema,
  ItemSchema,
  BlockObservationSchema,
  EntityObservationSchema,
  DroppedItemSchema,
  EnvironmentalHazardSchema,
  WeatherSchema,
  TimeOfDaySchema,
  AttackCooldownSchema,
  DigProgressSchema,
} from './bot.js';

// Full observation returned by the observe tool
export const ObservationSchema = z.object({
  position: PositionSchema,
  health: HealthStatusSchema,
  statusEffects: z.array(StatusEffectSchema),
  heldItem: ItemSchema.nullable(),
  armor: z.object({
    helmet: z.string().nullable(),
    chestplate: z.string().nullable(),
    leggings: z.string().nullable(),
    boots: z.string().nullable(),
  }),
  hotbar: z.array(ItemSchema).max(9),
  inventory: z.array(ItemSchema),
  inventorySummary: z.record(z.string(), z.number()),
  nearbyBlocks: z.array(BlockObservationSchema),
  nearbyEntities: z.array(EntityObservationSchema),
  nearbyDroppedItems: z.array(DroppedItemSchema),
  environmentalHazards: z.array(EnvironmentalHazardSchema),
  weather: WeatherSchema,
  timeOfDay: TimeOfDaySchema,
  biome: z.string(),
  dimension: z.string(),
  lightLevel: z.number(),
  groundDistance: z.number(),
  attackCooldown: AttackCooldownSchema,
  activeDig: DigProgressSchema.nullable(),
  craftableItems: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    requiresCraftingTable: z.boolean(),
  })),
});

export type Observation = z.infer<typeof ObservationSchema>;

// HUD data (mirrors what a player sees on screen)
export const HudDataSchema = z.object({
  health: z.number(),
  food: z.number(),
  saturation: z.number(),
  oxygen: z.number(),
  experienceLevel: z.number(),
  experienceProgress: z.number(),
  armorToughness: z.number(),
  heldItem: ItemSchema.nullable(),
  hotbar: z.array(ItemSchema).max(9),
  armor: z.object({
    helmet: z.string().nullable(),
    chestplate: z.string().nullable(),
    leggings: z.string().nullable(),
    boots: z.string().nullable(),
  }),
  statusEffects: z.array(StatusEffectSchema),
  bossBars: z.array(z.object({
    name: z.string(),
    health: z.number().min(0).max(1),
    color: z.string(),
    division: z.string(),
  })),
  attackCooldown: AttackCooldownSchema,
  activeDig: DigProgressSchema.nullable(),
});

export type HudData = z.infer<typeof HudDataSchema>;