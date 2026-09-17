import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { PublicApiError } from "./errors.js";
import type {
  EditInput,
  GenerationInput,
  ImageTask,
  ImageUpload,
  TaskLookupInput,
  UploadInput,
} from "./types.js";

const PRODUCTION_BASE_URL = "https://www.aiwatercolorgenerator.com";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type ApiClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

type ErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    param?: unknown;
  };
  request_id?: unknown;
};

export interface ApiClient {
  generate(input: GenerationInput): Promise<ImageTask>;
  edit(input: EditInput): Promise<ImageTask>;
  upload(input: UploadInput): Promise<ImageUpload>;
  getTask(input: TaskLookupInput): Promise<ImageTask>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function apiErrorFromResponse(
  status: number,
  payload: ErrorPayload | null,
): PublicApiError {
  const code = optionalString(payload?.error?.code) ?? "api_error";
  const message =
    optionalString(payload?.error?.message) ??
    "The API returned an unexpected response.";
  const param = optionalString(payload?.error?.param);
  const requestId = optionalString(payload?.request_id);

  return new PublicApiError({
    status,
    code,
    message,
    ...(param === undefined ? {} : { param }),
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function detectImageContentType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function readUploadFile(filePath: string) {
  const resolvedPath = resolve(filePath);
  let metadata;
  try {
    metadata = await stat(resolvedPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new PublicApiError({
        status: 0,
        code: "file_not_found",
        message: "The local image file was not found.",
        param: "file_path",
      });
    }
    throw new PublicApiError({
      status: 0,
      code: "file_read_error",
      message: "The local image file could not be inspected.",
      param: "file_path",
    });
  }

  if (!metadata.isFile() || metadata.size === 0) {
    throw new PublicApiError({
      status: 0,
      code: "invalid_file",
      message: "The upload path must point to a non-empty file.",
      param: "file_path",
    });
  }
  if (metadata.size > MAX_UPLOAD_BYTES) {
    throw new PublicApiError({
      status: 0,
      code: "file_too_large",
      message: "The image must not exceed 10 MiB.",
      param: "file_path",
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(resolvedPath);
  } catch {
    throw new PublicApiError({
      status: 0,
      code: "file_read_error",
      message: "The local image file could not be read.",
      param: "file_path",
    });
  }
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new PublicApiError({
      status: 0,
      code: bytes.length === 0 ? "invalid_file" : "file_too_large",
      message:
        bytes.length === 0
          ? "The upload path must point to a non-empty file."
          : "The image must not exceed 10 MiB.",
      param: "file_path",
    });
  }

  const contentType = detectImageContentType(bytes);
  if (!contentType) {
    throw new PublicApiError({
      status: 0,
      code: "unsupported_image_type",
      message: "Only JPEG, PNG, and WebP images are supported.",
      param: "file_path",
    });
  }

  return {
    bytes,
    filename: basename(resolvedPath),
    contentType,
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? PRODUCTION_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function request<T>(
    path: string,
    init: Omit<RequestInit, "signal">,
  ): Promise<T> {
    if (!apiKey) {
      throw new PublicApiError({
        status: 0,
        code: "missing_api_key",
        message: "Set AIWATERCOLOR_API_KEY before calling this tool.",
        param: "AIWATERCOLOR_API_KEY",
      });
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("Accept", "application/json");

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new PublicApiError({
          status: 0,
          code: "request_timeout",
          message: "The API request timed out.",
        });
      }
      throw new PublicApiError({
        status: 0,
        code: "network_error",
        message: "The API request could not be completed.",
      });
    }

    const contentType = response.headers.get("content-type")?.toLowerCase();
    const payload = contentType?.includes("application/json")
      ? ((await response.json().catch(() => null)) as T | ErrorPayload | null)
      : null;

    if (!response.ok) {
      throw apiErrorFromResponse(
        response.status,
        payload as ErrorPayload | null,
      );
    }
    if (payload === null) {
      throw apiErrorFromResponse(response.status, null);
    }
    return payload as T;
  }

  return {
    async generate(input) {
      const { idempotency_key, ...body } = input;
      return request<ImageTask>("/api/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency_key ?? `mcp-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
    },

    async edit(input) {
      const { idempotency_key, ...body } = input;
      return request<ImageTask>("/api/v1/images/edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency_key ?? `mcp-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
    },

    async upload(input) {
      const file = await readUploadFile(input.file_path);
      const body = new FormData();
      const data = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer;
      body.append(
        "file",
        new Blob([data], { type: file.contentType }),
        file.filename,
      );
      return request<ImageUpload>("/api/v1/uploads", {
        method: "POST",
        body,
      });
    },

    async getTask(input) {
      return request<ImageTask>(
        `/api/v1/tasks/${encodeURIComponent(input.task_id)}`,
        { method: "GET" },
      );
    },
  };
}
