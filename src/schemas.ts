import { z } from "zod";

import { ASPECT_RATIOS, MODELS, RESOLUTIONS } from "./types.js";

export const generationInputSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  model: z.enum(MODELS).default("watercolor-lite"),
  aspect_ratio: z.enum(ASPECT_RATIOS).default("auto"),
  resolution: z.enum(RESOLUTIONS).default("1k"),
  idempotency_key: z.string().min(8).max(255).optional(),
});

export const editInputSchema = generationInputSchema.extend({
  input_images: z.array(z.string().url().max(2048)).min(1).max(9),
});

export const uploadInputSchema = z.object({
  file_path: z.string().trim().min(1),
});

export const taskLookupInputSchema = z.object({
  task_id: z.string().trim().min(1),
});
