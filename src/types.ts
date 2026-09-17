export const MODELS = [
  "watercolor-lite",
  "gpt-image-2",
  "nano-banana-pro",
  "nano-banana-2",
] as const;

export const ASPECT_RATIOS = [
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
  "9:21",
] as const;

export const RESOLUTIONS = ["1k", "2k", "4k"] as const;

export type WatercolorModel = (typeof MODELS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export type GenerationInput = {
  prompt: string;
  model: WatercolorModel;
  aspect_ratio: AspectRatio;
  resolution: Resolution;
  idempotency_key?: string | undefined;
};

export type EditInput = GenerationInput & {
  input_images: string[];
};

export type UploadInput = {
  file_path: string;
};

export type TaskLookupInput = {
  task_id: string;
};

export type ImageTask = {
  id: string;
  object: "image_task";
  status: "queued" | "processing" | "succeeded" | "failed" | "canceled";
  operation: "generation" | "edit";
  model: WatercolorModel;
  resolution: Resolution;
  aspect_ratio: AspectRatio;
  prompt: string;
  output: Array<{ url: string; content_type: string }>;
  credits: { charged: number; refunded: number };
  error: { code: string } | null;
  created_at: string;
  completed_at: string | null;
  links: { self: string };
};

export type ImageUpload = {
  id: string;
  object: "image_upload";
  url: string;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
