import { z } from "zod";

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const YOUTUBE_HANDLE = /^@[A-Za-z0-9._-]+$/;

const YouTubeSourceSchema = z
  .object({
    name: z.string().min(1, "source name must be non-empty"),
    handle: z
      .string()
      .regex(YOUTUBE_HANDLE, "YouTube handle must start with @ and contain only [A-Za-z0-9._-]"),
    minDuration: z.number().int().nonnegative().optional(),
    maxDuration: z.number().int().nonnegative().optional(),
    topPercentile: z.number().min(0).max(100).optional(),
  })
  .refine(
    (s) =>
      s.minDuration === undefined ||
      s.maxDuration === undefined ||
      s.minDuration <= s.maxDuration,
    { message: "minDuration must be <= maxDuration" },
  );

export const StationConfigSchema = z.object({
  id: z.string().regex(KEBAB_CASE, "station id must be kebab-case [a-z0-9-]"),
  name: z.string().min(1, "station name must be non-empty"),
  description: z.string().min(1, "station description must be non-empty"),
  sources: z.array(YouTubeSourceSchema).min(1, "station must have at least one source"),
});

export const StationsConfigSchema = z
  .array(StationConfigSchema)
  .min(1, "stations.json must contain at least one station")
  .refine(
    (arr) => new Set(arr.map((s) => s.id)).size === arr.length,
    { message: "station ids must be unique" },
  );

export type StationConfigParsed = z.infer<typeof StationConfigSchema>;
export type StationsConfigParsed = z.infer<typeof StationsConfigSchema>;
