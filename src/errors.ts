import type { ToolResult } from "./types.js";

type PublicApiErrorOptions = {
  status: number;
  code: string;
  message: string;
  param?: string;
  requestId?: string;
};

export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string;
  readonly requestId?: string;

  constructor(options: PublicApiErrorOptions) {
    super(options.message);
    this.name = "PublicApiError";
    this.status = options.status;
    this.code = options.code;
    if (options.param !== undefined) this.param = options.param;
    if (options.requestId !== undefined) this.requestId = options.requestId;
  }
}

export function toToolResult(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function toToolError(error: unknown): ToolResult {
  if (error instanceof PublicApiError) {
    const details: Record<string, string> = {
      code: error.code,
      message: error.message,
    };
    if (error.param !== undefined) details.param = error.param;
    if (error.requestId !== undefined) details.request_id = error.requestId;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: details }, null, 2),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: {
              code: "internal_error",
              message: "An unexpected error occurred.",
            },
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
