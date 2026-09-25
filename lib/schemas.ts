import { z } from "zod";

export const searchRequestSchema = z.object({
  keyword: z.string().min(1).max(200),
  category: z.string().max(200).optional().default(""),
  locationText: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(100).max(100000).optional().default(10000),
  country: z.string().max(100).optional().default(""),
  limit: z.number().int().min(1).max(500).optional().default(100),
  discoveryProvider: z
    .enum(["google_places", "browser_discovery", "automatic"])
    .optional()
    .default("automatic"),
  primaryProvider: z
    .enum(["google_places", "browser_discovery"])
    .optional()
    .default("google_places"),
  fallbackProvider: z
    .enum(["google_places", "browser_discovery"])
    .optional()
    .default("browser_discovery"),
  enrichWebsite: z.boolean().optional().default(true),
  discoverSocial: z.boolean().optional().default(true),
  discoverContacts: z.boolean().optional().default(true),
  multiLocation: z.boolean().optional().default(true),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const enrichRequestSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(100),
  force: z.boolean().optional().default(false),
});

export const exportRequestSchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  columns: z.array(z.string()).optional().default([]),
  searchJobId: z.string().uuid().optional(),
  selectedIds: z.array(z.string().uuid()).optional().default([]),
  filters: z.record(z.string(), z.string()).optional().default({}),
});
