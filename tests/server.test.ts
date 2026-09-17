import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../src/api-client.js";
import { PublicApiError } from "../src/errors.js";
import { createWatercolorMcpServer } from "../src/server.js";
import type { ImageTask, ImageUpload } from "../src/types.js";

const task: ImageTask = {
  id: "task_123",
  object: "image_task",
  status: "queued",
  operation: "generation",
  model: "watercolor-lite",
  resolution: "1k",
  aspect_ratio: "auto",
  prompt: "A misty lake",
  output: [],
  credits: { charged: 1, refunded: 0 },
  error: null,
  created_at: "2026-09-17T00:00:00.000Z",
  completed_at: null,
  links: { self: "/api/v1/tasks/task_123" },
};

const upload: ImageUpload = {
  id: "upload_123",
  object: "image_upload",
  url: "https://cdn.example.com/input.png",
  content_type: "image/png",
  size_bytes: 1024,
};

function fakeApiClient(): ApiClient {
  return {
    generate: vi.fn(async () => task),
    upload: vi.fn(async () => upload),
    edit: vi.fn(async () => ({ ...task, operation: "edit" as const })),
    getTask: vi.fn(async () => task),
  };
}

const openConnections: Array<{
  client: Client;
  server: ReturnType<typeof createWatercolorMcpServer>;
}> = [];

async function connect(apiClient: ApiClient) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createWatercolorMcpServer(apiClient);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  openConnections.push({ client, server });
  return { client, server };
}

afterEach(async () => {
  await Promise.all(
    openConnections.splice(0).map(async ({ client, server }) => {
      await client.close();
      await server.close();
    }),
  );
});

describe("watercolor MCP server", () => {
  it("lists exactly four documented tools and required fields", async () => {
    const { client } = await connect(fakeApiClient());
    const { tools } = await client.listTools();

    expect(client.getInstructions()).toContain(
      "call upload_watercolor_input first",
    );
    expect(client.getInstructions()).toContain("consume account credits");
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "edit_watercolor",
      "generate_watercolor",
      "get_watercolor_task",
      "upload_watercolor_input",
    ]);
    const required = Object.fromEntries(
      tools.map((tool) => [tool.name, tool.inputSchema.required]),
    );
    expect(required).toMatchObject({
      generate_watercolor: ["prompt"],
      upload_watercolor_input: ["file_path"],
      edit_watercolor: ["prompt", "input_images"],
      get_watercolor_task: ["task_id"],
    });
  });

  it("delegates all tool calls with parsed defaults", async () => {
    const apiClient = fakeApiClient();
    const { client } = await connect(apiClient);

    const generated = await client.callTool({
      name: "generate_watercolor",
      arguments: { prompt: "A misty lake" },
    });
    const uploaded = await client.callTool({
      name: "upload_watercolor_input",
      arguments: { file_path: "/tmp/input.png" },
    });
    const edited = await client.callTool({
      name: "edit_watercolor",
      arguments: {
        prompt: "Use soft washes",
        input_images: [upload.url],
      },
    });
    const fetched = await client.callTool({
      name: "get_watercolor_task",
      arguments: { task_id: task.id },
    });

    expect(apiClient.generate).toHaveBeenCalledWith({
      prompt: "A misty lake",
      model: "watercolor-lite",
      aspect_ratio: "auto",
      resolution: "1k",
    });
    expect(apiClient.upload).toHaveBeenCalledWith({
      file_path: "/tmp/input.png",
    });
    expect(apiClient.edit).toHaveBeenCalledWith({
      prompt: "Use soft washes",
      input_images: [upload.url],
      model: "watercolor-lite",
      aspect_ratio: "auto",
      resolution: "1k",
    });
    expect(apiClient.getTask).toHaveBeenCalledWith({ task_id: task.id });
    for (const result of [generated, uploaded, edited, fetched]) {
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      );
    }
  });

  it("returns structured API errors without closing the connection", async () => {
    const apiClient = fakeApiClient();
    vi.mocked(apiClient.generate).mockRejectedValueOnce(
      new PublicApiError({
        status: 402,
        code: "insufficient_credits",
        message: "Not enough credits.",
      }),
    );
    vi.mocked(apiClient.getTask).mockRejectedValueOnce(
      new Error("Authorization: Bearer example-secret"),
    );
    const { client } = await connect(apiClient);

    const publicError = await client.callTool({
      name: "generate_watercolor",
      arguments: { prompt: "A misty lake" },
    });
    const internalError = await client.callTool({
      name: "get_watercolor_task",
      arguments: { task_id: task.id },
    });
    const tools = await client.listTools();

    expect(publicError.isError).toBe(true);
    expect(JSON.parse(String(publicError.content[0]!.text))).toMatchObject({
      error: { code: "insufficient_credits" },
    });
    expect(internalError.isError).toBe(true);
    expect(JSON.stringify(internalError)).not.toContain("example-secret");
    expect(tools.tools).toHaveLength(4);
  });
});
