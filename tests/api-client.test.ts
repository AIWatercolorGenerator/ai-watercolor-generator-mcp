import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "../src/api-client.js";
import { PublicApiError } from "../src/errors.js";
import type { ImageTask } from "../src/types.js";

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

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(response: Response) {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("API client JSON operations", () => {
  it("maps generation input to the production endpoint", async () => {
    const fetchImpl = mockFetch(jsonResponse(task, 202));
    const client = createApiClient({
      apiKey: "test-api-key",
      baseUrl: "https://api.example.com/",
      fetchImpl,
    });

    await expect(
      client.generate({
        prompt: "A misty lake",
        model: "watercolor-lite",
        aspect_ratio: "auto",
        resolution: "1k",
        idempotency_key: "generation-123",
      }),
    ).resolves.toEqual(task);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe("https://api.example.com/api/v1/images/generations");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-api-key");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("generation-123");
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "A misty lake",
      model: "watercolor-lite",
      aspect_ratio: "auto",
      resolution: "1k",
    });
  });

  it("maps edit input and generates an idempotency key", async () => {
    const editTask = { ...task, operation: "edit" as const };
    const fetchImpl = mockFetch(jsonResponse(editTask, 202));
    const client = createApiClient({
      apiKey: "test-api-key",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    await client.edit({
      prompt: "Use soft washes",
      input_images: ["https://cdn.example.com/input.png"],
      model: "watercolor-lite",
      aspect_ratio: "4:3",
      resolution: "2k",
    });

    const [, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toMatch(/^mcp-[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "Use soft washes",
      input_images: ["https://cdn.example.com/input.png"],
      model: "watercolor-lite",
      aspect_ratio: "4:3",
      resolution: "2k",
    });
  });

  it("URL-encodes task IDs and uses GET", async () => {
    const fetchImpl = mockFetch(jsonResponse(task));
    const client = createApiClient({
      apiKey: "test-api-key",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    await client.getTask({ task_id: "task/with spaces" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/tasks/task%2Fwith%20spaces",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns a configuration error when the API key is missing", async () => {
    const fetchImpl = mockFetch(jsonResponse(task));
    const client = createApiClient({
      apiKey: "",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    await expect(client.getTask({ task_id: "task_123" })).rejects.toMatchObject(
      {
        status: 0,
        code: "missing_api_key",
      },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps structured API errors without leaking the key", async () => {
    const fetchImpl = mockFetch(
      jsonResponse(
        {
          error: {
            code: "insufficient_credits",
            message: "Not enough credits.",
            param: "credits",
          },
          request_id: "req_123",
        },
        402,
      ),
    );
    const client = createApiClient({
      apiKey: "example-secret-value",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    const error = await client
      .getTask({ task_id: "task_123" })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(PublicApiError);
    expect(error).toMatchObject({
      status: 402,
      code: "insufficient_credits",
      message: "Not enough credits.",
      param: "credits",
      requestId: "req_123",
    });
    expect(String(error)).not.toContain("example-secret-value");
  });

  it("maps non-JSON API failures to a safe error", async () => {
    const fetchImpl = mockFetch(
      new Response("<html>bad gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const client = createApiClient({
      apiKey: "example-secret-value",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    await expect(client.getTask({ task_id: "task_123" })).rejects.toMatchObject(
      {
        status: 502,
        code: "api_error",
        message: "The API returned an unexpected response.",
      },
    );
  });

  it("maps network failures and timeouts without exposing details", async () => {
    const networkFetch = vi.fn(async () => {
      throw new Error("socket failed with Authorization: Bearer secret");
    }) as unknown as typeof fetch;
    const timeoutFetch = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    }) as unknown as typeof fetch;

    await expect(
      createApiClient({
        apiKey: "key",
        fetchImpl: networkFetch,
      }).getTask({ task_id: "task_123" }),
    ).rejects.toMatchObject({ code: "network_error" });
    await expect(
      createApiClient({
        apiKey: "key",
        fetchImpl: timeoutFetch,
      }).getTask({ task_id: "task_123" }),
    ).rejects.toMatchObject({ code: "request_timeout" });
  });
});

describe("API client upload", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function temporaryFile(name: string, bytes: Uint8Array) {
    const directory = await mkdtemp(join(tmpdir(), "watercolor-mcp-test-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, name);
    await writeFile(filePath, bytes);
    return filePath;
  }

  it.each([
    {
      name: "input.png",
      type: "image/png",
      bytes: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]),
    },
    {
      name: "input.jpg",
      type: "image/jpeg",
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
    },
    {
      name: "input.webp",
      type: "image/webp",
      bytes: new TextEncoder().encode("RIFF\0\0\0\0WEBP"),
    },
  ])("uploads $type as multipart form data", async ({ name, type, bytes }) => {
    const filePath = await temporaryFile(name, bytes);
    const upload = {
      id: "upload_123",
      object: "image_upload" as const,
      url: "https://cdn.example.com/input.png",
      content_type: type,
      size_bytes: bytes.length,
    };
    const fetchImpl = mockFetch(jsonResponse(upload, 201));
    const client = createApiClient({
      apiKey: "test-api-key",
      baseUrl: "https://api.example.com",
      fetchImpl,
    });

    await expect(client.upload({ file_path: filePath })).resolves.toEqual(
      upload,
    );

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe("https://api.example.com/api/v1/uploads");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-api-key");
    expect(headers.has("Content-Type")).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
    const file = (init?.body as FormData).get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe(basename(filePath));
    expect((file as File).type).toBe(type);
  });

  it("rejects missing paths and directories before fetch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "watercolor-mcp-test-"));
    temporaryDirectories.push(directory);
    const fetchImpl = mockFetch(jsonResponse({}));
    const client = createApiClient({ apiKey: "key", fetchImpl });

    await expect(
      client.upload({ file_path: join(directory, "missing.png") }),
    ).rejects.toMatchObject({ code: "file_not_found" });
    await expect(client.upload({ file_path: directory })).rejects.toMatchObject(
      { code: "invalid_file" },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects empty, oversized, and unsupported files before fetch", async () => {
    const empty = await temporaryFile("empty.png", new Uint8Array());
    const oversized = await temporaryFile(
      "large.png",
      new Uint8Array(10 * 1024 * 1024 + 1),
    );
    const unsupported = await temporaryFile(
      "input.gif",
      new TextEncoder().encode("GIF89a"),
    );
    const fetchImpl = mockFetch(jsonResponse({}));
    const client = createApiClient({ apiKey: "key", fetchImpl });

    await expect(client.upload({ file_path: empty })).rejects.toMatchObject({
      code: "invalid_file",
    });
    await expect(client.upload({ file_path: oversized })).rejects.toMatchObject(
      { code: "file_too_large" },
    );
    await expect(
      client.upload({ file_path: unsupported }),
    ).rejects.toMatchObject({ code: "unsupported_image_type" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
