import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ApiClient } from "./api-client.js";
import { toToolError, toToolResult } from "./errors.js";
import { packageVersion } from "./package-version.js";
import {
  editInputSchema,
  generationInputSchema,
  taskLookupInputSchema,
  uploadInputSchema,
} from "./schemas.js";

export function createWatercolorMcpServer(apiClient: ApiClient) {
  const server = new McpServer(
    {
      name: "ai-watercolor-generator-mcp",
      version: packageVersion,
    },
    {
      instructions:
        "Create tasks with generate_watercolor. For local image edits, call upload_watercolor_input first and pass its URL to edit_watercolor. Generation and editing are asynchronous: poll get_watercolor_task every 2–5 seconds until the status is succeeded, failed, or canceled. Image operations consume account credits.",
    },
  );

  async function safely(run: () => Promise<unknown>) {
    try {
      return toToolResult(await run());
    } catch (error) {
      return toToolError(error);
    }
  }

  server.registerTool(
    "generate_watercolor",
    {
      description:
        "Create watercolor artwork from a text prompt as an asynchronous task.",
      inputSchema: generationInputSchema.shape,
    },
    async (input) => safely(() => apiClient.generate(input)),
  );

  server.registerTool(
    "upload_watercolor_input",
    {
      description:
        "Upload a local JPEG, PNG, or WebP file for watercolor editing.",
      inputSchema: uploadInputSchema.shape,
    },
    async (input) => safely(() => apiClient.upload(input)),
  );

  server.registerTool(
    "edit_watercolor",
    {
      description:
        "Transform uploaded images into watercolor artwork as an asynchronous task.",
      inputSchema: editInputSchema.shape,
    },
    async (input) => safely(() => apiClient.edit(input)),
  );

  server.registerTool(
    "get_watercolor_task",
    {
      description:
        "Get the current status, output, or error for a watercolor task.",
      inputSchema: taskLookupInputSchema.shape,
    },
    async (input) => safely(() => apiClient.getTask(input)),
  );

  return server;
}
