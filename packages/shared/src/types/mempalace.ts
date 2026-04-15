import { z } from 'zod';

// MemPalace wing/room structure
export const MemPalaceWingSchema = z.object({
  name: z.string(),
  roomCount: z.number(),
});

export const MemPalaceRoomSchema = z.object({
  name: z.string(),
  wing: z.string(),
  drawerCount: z.number(),
});

export type MemPalaceWing = z.infer<typeof MemPalaceWingSchema>;
export type MemPalaceRoom = z.infer<typeof MemPalaceRoomSchema>;

// MemPalace drawer (verbatim content storage)
export const MemPalaceDrawerSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  wing: z.string(),
  room: z.string(),
  createdAt: z.string().optional(),
});

export type MemPalaceDrawer = z.infer<typeof MemPalaceDrawerSchema>;

// MemPalace knowledge graph triple
export const MemPalaceTripleSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export type MemPalaceTriple = z.infer<typeof MemPalaceTripleSchema>;

// MemPalace search result
export const MemPalaceSearchResultSchema = z.object({
  content: z.string(),
  wing: z.string(),
  room: z.string(),
  score: z.number(),
  drawerId: z.string().optional(),
});

export type MemPalaceSearchResult = z.infer<typeof MemPalaceSearchResultSchema>;

// MemPalace diary entry
export const MemPalaceDiaryEntrySchema = z.object({
  agentName: z.string(),
  content: z.string(),
  timestamp: z.string(),
});

export type MemPalaceDiaryEntry = z.infer<typeof MemPalaceDiaryEntrySchema>;

// Minecraft skill metadata stored in MemPalace
export const SkillMetadataSchema = z.object({
  goal: z.string(),
  requiredTools: z.array(z.string()),
  requiredInventory: z.array(z.string()),
  successConditions: z.string(),
  minecraftVersion: z.string(),
  createdAt: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

// MemPalace tool names for type-safe calls
export const MemPalaceToolName = z.enum([
  'mempalace_status',
  'mempalace_list_wings',
  'mempalace_list_rooms',
  'mempalace_get_taxonomy',
  'mempalace_search',
  'mempalace_check_duplicate',
  'mempalace_get_aaak_spec',
  'mempalace_add_drawer',
  'mempalace_delete_drawer',
  'mempalace_get_drawer',
  'mempalace_list_drawers',
  'mempalace_update_drawer',
  'mempalace_kg_query',
  'mempalace_kg_add',
  'mempalace_kg_invalidate',
  'mempalace_kg_timeline',
  'mempalace_kg_stats',
  'mempalace_traverse',
  'mempalace_find_tunnels',
  'mempalace_graph_stats',
  'mempalace_create_tunnel',
  'mempalace_list_tunnels',
  'mempalace_follow_tunnels',
  'mempalace_diary_write',
  'mempalace_diary_read',
  'mempalace_hook_settings',
  'mempalace_memories_filed_away',
  'mempalace_reconnect',
]);

export type MemPalaceToolNameType = z.infer<typeof MemPalaceToolName>;