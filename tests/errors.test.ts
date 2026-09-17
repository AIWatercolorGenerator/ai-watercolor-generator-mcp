import { describe, expect, it } from "vitest";

import { PublicApiError, toToolError } from "../src/errors.js";
import {
  editInputSchema,
  generationInputSchema,
  taskLookupInputSchema,
  uploadInputSchema,
} from "../src/schemas.js";

describe("tool input schemas", () => {
  it("applies production defaults to generation input", () => {
    expect(generationInputSchema.parse({ prompt: "A misty lake" })).toEqual({
      prompt: "A misty lake",
      model: "watercolor-lite",
      aspect_ratio: "auto",
      resolution: "1k",
    });
  });

  it("accepts every documented model, ratio, and resolution", () => {
    const models = [
      "watercolor-lite",
      "gpt-image-2",
      "nano-banana-pro",
      "nano-banana-2",
    ];
    const ratios = [
      "auto",
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "21:9",
      "9:21",
    ];
    const resolutions = ["1k", "2k", "4k"];

    for (const model of models) {
      for (const aspect_ratio of ratios) {
        for (const resolution of resolutions) {
          expect(
            generationInputSchema.safeParse({
              prompt: "Watercolor test",
              model,
              aspect_ratio,
              resolution,
            }).success,
          ).toBe(true);
        }
      }
    }
  });

  it("enforces prompt and idempotency-key lengths", () => {
    expect(generationInputSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(
      generationInputSchema.safeParse({ prompt: "x".repeat(4001) }).success,
    ).toBe(false);
    expect(
      generationInputSchema.safeParse({
        prompt: "ok",
        idempotency_key: "short",
      }).success,
    ).toBe(false);
    expect(
      generationInputSchema.safeParse({
        prompt: "ok",
        idempotency_key: "x".repeat(256),
      }).success,
    ).toBe(false);
  });

  it("requires one to nine trusted upload URLs for edits", () => {
    expect(
      editInputSchema.safeParse({ prompt: "Edit", input_images: [] }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({
        prompt: "Edit",
        input_images: ["https://cdn.example.com/input.png"],
      }).success,
    ).toBe(true);
    expect(
      editInputSchema.safeParse({
        prompt: "Edit",
        input_images: Array.from(
          { length: 10 },
          (_, index) => `https://cdn.example.com/${index}.png`,
        ),
      }).success,
    ).toBe(false);
  });

  it("requires non-empty upload paths and task IDs", () => {
    expect(uploadInputSchema.safeParse({ file_path: "" }).success).toBe(false);
    expect(
      uploadInputSchema.safeParse({ file_path: "/tmp/a.png" }).success,
    ).toBe(true);
    expect(taskLookupInputSchema.safeParse({ task_id: "" }).success).toBe(
      false,
    );
    expect(
      taskLookupInputSchema.safeParse({ task_id: "task_123" }).success,
    ).toBe(true);
  });
});

describe("safe tool errors", () => {
  it("preserves structured public API details", () => {
    const result = toToolError(
      new PublicApiError({
        status: 402,
        code: "insufficient_credits",
        message: "Not enough credits.",
        param: "credits",
        requestId: "req_123",
      }),
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      error: {
        code: "insufficient_credits",
        message: "Not enough credits.",
        param: "credits",
        request_id: "req_123",
      },
    });
  });

  it("does not expose unexpected error messages or credentials", () => {
    const secret = "example-secret-do-not-expose";
    const result = toToolError(
      new Error(`Authorization: Bearer ${secret}; internal failure`),
    );
    const text = result.content[0]!.text;

    expect(result.isError).toBe(true);
    expect(text).not.toContain(secret);
    expect(text).not.toContain("Authorization");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    });
  });
});
