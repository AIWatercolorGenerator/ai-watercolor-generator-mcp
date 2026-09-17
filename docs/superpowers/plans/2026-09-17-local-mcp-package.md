# AI Watercolor Generator Local MCP Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a public Node.js stdio MCP server that exposes AI Watercolor Generator's production REST API through four useful tools.

**Architecture:** A small TypeScript ESM CLI registers MCP tools over stdio and delegates all network operations to an isolated REST API client. The package reads only an API key from the environment, keeps stdout protocol-clean, and adds an explicit local-file upload tool without duplicating website business logic.

**Tech Stack:** Node.js 20+, TypeScript 7, pnpm 11, `@modelcontextprotocol/sdk` 1.30, Zod 4, Vitest 4, Prettier 3

**Spec:** `docs/superpowers/specs/2026-09-17-local-mcp-package-design.md`

## Implementation Checklist

- [x] Task 1: Scaffold the publishable TypeScript CLI package
- [x] Task 2: Define stable schemas, types, and safe errors
- [x] Task 3: Implement JSON REST API operations
- [x] Task 4: Implement safe local image upload
- [x] Task 5: Register and test the four MCP tools
- [x] Task 6: Add the stdio executable and process smoke test
- [x] Task 7: Add public documentation, security policy, and CI
- [x] Task 8: Verify the release artifact and prepare publication metadata

## Global Constraints

- Work only in the `ai-watercolor-generator-mcp` project directory.
- Use pnpm for dependency and script commands.
- Support ESM on Node.js `>=20`.
- Publish as `@ai-watercolor-generator/mcp` with bin `ai-watercolor-generator-mcp`.
- Use only `https://www.aiwatercolorgenerator.com` as the runtime API origin.
- Read credentials only from `AIWATERCOLOR_API_KEY`.
- Keep stdout exclusively for MCP stdio messages; diagnostics go to stderr.
- Never log the API key, Authorization header, image bytes, or complete request bodies.
- Keep generation and editing asynchronous; do not add a wait tool.
- Do not call Fal, databases, website Agent code, or internal prompts.
- Do not create a Git commit until every task passes and the user explicitly requests it.
- Do not publish GitHub, npm, or Registry artifacts until the user has created the two organizations and explicitly approves publishing.

## File Map

| File                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| `package.json`             | Package identity, scripts, runtime dependencies, bin and publish allowlist |
| `tsconfig.json`            | Strict Node ESM compilation from `src` to `dist`                           |
| `vitest.config.ts`         | Unit/integration test configuration                                        |
| `src/types.ts`             | Public input and API response types                                        |
| `src/schemas.ts`           | Zod schemas shared by MCP tool registration                                |
| `src/errors.ts`            | Sanitized API/configuration error model and MCP error formatting           |
| `src/api-client.ts`        | Production REST requests, timeout, JSON parsing and multipart upload       |
| `src/server.ts`            | Four MCP tool registrations and delegation to `ApiClient`                  |
| `src/index.ts`             | Shebang, environment resolution and stdio transport startup                |
| `tests/api-client.test.ts` | HTTP mapping, auth, errors, timeout and upload behavior                    |
| `tests/server.test.ts`     | Tool discovery, schemas and tool result/error behavior                     |
| `tests/stdio.test.ts`      | Built CLI subprocess initialization and `tools/list` smoke test            |
| `.github/workflows/ci.yml` | Install, test, build and package-content checks                            |
| `README.md`                | Installation, client configuration, tools, workflow and official links     |
| `SECURITY.md`              | Vulnerability reporting and credential-handling guidance                   |
| `LICENSE`                  | MIT license                                                                |
| `server.json`              | Post-publication Registry metadata containing remote and npm transports    |

---

### Task 1: Scaffold the publishable TypeScript CLI package

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.prettierignore`

**Interfaces:**

- Produces: scripts `build`, `test`, `test:unit`, `format`, `format:check`, `typecheck`, and `pack:check`.
- Produces: executable mapping `ai-watercolor-generator-mcp -> dist/index.js`.

- [ ] **Step 1: Write the package manifest**

Create `package.json` with this contract:

```json
{
  "name": "@ai-watercolor-generator/mcp",
  "version": "0.1.0",
  "description": "Create watercolor art from text or transform local images through an MCP server.",
  "type": "module",
  "bin": {
    "ai-watercolor-generator-mcp": "dist/index.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test:unit": "vitest run --exclude tests/stdio.test.ts",
    "test": "pnpm build && vitest run",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "pack:check": "pnpm pack --dry-run"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^20.17.0",
    "prettier": "3.8.1",
    "typescript": "^7.0.2",
    "vitest": "^4.0.17"
  }
}
```

Also add the final GitHub `repository`, `bugs`, `homepage`, `keywords`, `license`, and `author` fields before Task 8; keep the initial scaffold runnable before the organization exists.

- [ ] **Step 2: Add strict compiler and test configuration**

Use `module` and `moduleResolution` `NodeNext`, `target` `ES2022`, `rootDir` `src`, `outDir` `dist`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, and include `src/**/*.ts` only for production compilation. Configure Vitest for Node, `tests/**/*.test.ts`, restored mocks, and 10-second default timeouts.

- [ ] **Step 3: Add ignore rules**

Ignore `node_modules/`, `dist/`, `coverage/`, `*.tgz`, `.env*`, `.DS_Store`, and local MCP client configuration. Do not ignore `pnpm-lock.yaml`, docs, or `server.json`.

- [ ] **Step 4: Install dependencies and verify the empty scaffold**

Run:

```bash
pnpm install
pnpm exec tsc --version
pnpm exec vitest --version
```

Expected: lockfile created, TypeScript 7.x and Vitest 4.x reported, with no install scripts from unexpected packages.

---

### Task 2: Define stable schemas, types, and safe errors

**Files:**

- Create: `src/types.ts`
- Create: `src/schemas.ts`
- Create: `src/errors.ts`
- Create: `tests/errors.test.ts`

**Interfaces:**

- Produces: `GenerationInput`, `EditInput`, `UploadInput`, `TaskLookupInput`, `ImageTask`, and `ImageUpload`.
- Produces: `generationInputSchema`, `editInputSchema`, `uploadInputSchema`, and `taskLookupInputSchema`.
- Produces: `PublicApiError` and `toToolError(error: unknown): ToolResult`.

- [ ] **Step 1: Write failing schema and error tests**

Cover the production enums exactly:

```ts
const models = [
  "watercolor-lite",
  "gpt-image-2",
  "nano-banana-pro",
  "nano-banana-2",
] as const;

const aspectRatios = [
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
  "9:21",
] as const;
```

Tests must prove prompt length 1–4000, resolution `1k|2k|4k`, 1–9 edit URLs, idempotency key length 8–255, non-empty task IDs, and non-empty upload paths. Error tests must prove `toToolError` never includes a supplied API key or Authorization header.

- [ ] **Step 2: Run the tests and confirm failure**

Run `pnpm exec vitest run tests/errors.test.ts`.

Expected: FAIL because `src/schemas.ts` and `src/errors.ts` do not exist.

- [ ] **Step 3: Implement types and schemas**

Use Zod defaults matching production: model `watercolor-lite`, aspect ratio `auto`, resolution `1k`. Keep `idempotency_key` optional so the API client can generate a UUID when absent.

Define the tool-result shape locally to avoid importing internal SDK types:

```ts
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
```

`PublicApiError` must store only HTTP status, stable code, safe message, optional param, and optional request ID.

- [ ] **Step 4: Run focused tests**

Run `pnpm exec vitest run tests/errors.test.ts`.

Expected: PASS.

---

### Task 3: Implement JSON REST API operations

**Files:**

- Create: `src/api-client.ts`
- Create: `tests/api-client.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ApiClient {
  generate(input: GenerationInput): Promise<ImageTask>;
  edit(input: EditInput): Promise<ImageTask>;
  upload(input: UploadInput): Promise<ImageUpload>;
  getTask(input: TaskLookupInput): Promise<ImageTask>;
}

export function createApiClient(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}): ApiClient;
```

`baseUrl` exists for dependency-injected tests but `src/index.ts` must never read it from user configuration.

- [ ] **Step 1: Write failing request-mapping tests**

Use a mocked `fetchImpl` to verify:

- generation uses `POST /api/v1/images/generations`;
- edit uses `POST /api/v1/images/edits`;
- task lookup URL-encodes the task ID and uses GET;
- all requests send `Authorization: Bearer <key>`;
- generate/edit send `Content-Type: application/json` and `Idempotency-Key`;
- absent idempotency keys become fresh UUID-based values;
- JSON bodies contain only documented fields.

- [ ] **Step 2: Write failing response/error tests**

Test 200/202 success, structured API errors, a non-JSON 502 response, fetch rejection, and AbortError timeout. Verify error messages omit the API key and request body.

- [ ] **Step 3: Run focused tests and confirm failure**

Run `pnpm exec vitest run tests/api-client.test.ts`.

Expected: FAIL because `createApiClient` does not exist.

- [ ] **Step 4: Implement shared request handling and JSON methods**

Use `AbortSignal.timeout(timeoutMs)` with a 30-second default. Parse JSON only after checking content type; accept successful JSON responses and map all non-2xx responses to `PublicApiError`. Never retry mutations automatically.

- [ ] **Step 5: Run focused tests**

Run `pnpm exec vitest run tests/api-client.test.ts`.

Expected: JSON operation tests PASS; upload tests remain absent until Task 4.

---

### Task 4: Implement safe local image upload

**Files:**

- Modify: `src/api-client.ts`
- Modify: `tests/api-client.test.ts`

**Interfaces:**

- Completes: `ApiClient.upload({ file_path }): Promise<ImageUpload>`.
- Internal helper: `readUploadFile(filePath: string): Promise<{ bytes: Uint8Array; filename: string; contentType: string }>`.

- [ ] **Step 1: Add failing upload tests**

Use temporary files generated by the tests. Cover:

- missing path;
- directory path;
- file larger than 10 MiB, rejected before fetch;
- PNG, JPEG and WebP signatures;
- unsupported signature;
- multipart POST to `/api/v1/uploads` with filename and MIME type;
- API upload response returned unchanged.

- [ ] **Step 2: Run upload tests and confirm failure**

Run `pnpm exec vitest run tests/api-client.test.ts -t upload`.

Expected: FAIL because upload is not implemented.

- [ ] **Step 3: Implement bounded file reading and multipart upload**

Resolve the explicit path, call `stat`, require `isFile()`, and reject `size === 0` or `size > 10 * 1024 * 1024` before reading. Detect MIME type from magic bytes, create a `Blob`, append it to `FormData` as field `file`, and let fetch set the multipart boundary. Do not set `Content-Type` manually.

- [ ] **Step 4: Run focused and full API client tests**

Run:

```bash
pnpm exec vitest run tests/api-client.test.ts -t upload
pnpm exec vitest run tests/api-client.test.ts
```

Expected: PASS.

---

### Task 5: Register and test the four MCP tools

**Files:**

- Create: `src/server.ts`
- Create: `tests/server.test.ts`

**Interfaces:**

- Consumes: `ApiClient` and the four Zod schemas.
- Produces: `createWatercolorMcpServer(apiClient: ApiClient): McpServer`.

- [ ] **Step 1: Write failing discovery tests**

Connect an SDK `Client` and the returned server with `InMemoryTransport.createLinkedPair()`. Assert `tools/list` returns exactly:

```ts
[
  "edit_watercolor",
  "generate_watercolor",
  "get_watercolor_task",
  "upload_watercolor_input",
];
```

Assert each listed schema exposes the documented required fields.

- [ ] **Step 2: Write failing invocation tests**

Provide a fake `ApiClient`. Invoke all four tools through the MCP client and verify each delegates once with parsed/defaulted input. Verify `PublicApiError` and unexpected errors return `isError: true` with JSON text and do not reject the MCP connection.

- [ ] **Step 3: Run server tests and confirm failure**

Run `pnpm exec vitest run tests/server.test.ts`.

Expected: FAIL because `createWatercolorMcpServer` does not exist.

- [ ] **Step 4: Register minimal tool handlers**

Create the MCP server with implementation name `ai-watercolor-generator-mcp` and package version `0.1.0`. Each handler calls one `ApiClient` method and serializes its result as formatted JSON text. Use these descriptions:

```text
generate_watercolor: Create watercolor artwork from a text prompt as an asynchronous task.
upload_watercolor_input: Upload a local JPEG, PNG, or WebP file for watercolor editing.
edit_watercolor: Transform uploaded images into watercolor artwork as an asynchronous task.
get_watercolor_task: Get the current status, output, or error for a watercolor task.
```

Set server `instructions` to explain the upload-before-edit workflow, 2–5 second asynchronous polling, terminal statuses, and account-credit usage. Keep the complete instruction under 512 characters.

- [ ] **Step 5: Run server tests**

Run `pnpm exec vitest run tests/server.test.ts`.

Expected: PASS.

---

### Task 6: Add the stdio executable and process smoke test

**Files:**

- Create: `src/index.ts`
- Create: `tests/stdio.test.ts`

**Interfaces:**

- Consumes: `createApiClient` and `createWatercolorMcpServer`.
- Produces: executable `dist/index.js` with a Node shebang.

- [ ] **Step 1: Write the CLI entry point**

The first line must be `#!/usr/bin/env node`. Read and trim `AIWATERCOLOR_API_KEY`, build the client with the fixed production origin, connect `StdioServerTransport`, and catch startup failures by writing one sanitized line to stderr before setting `process.exitCode = 1`.

Do not fail merely because the key is missing. Construct a client whose tool calls return `missing_api_key`; this keeps tool discovery functional in MCP hosts.

- [ ] **Step 2: Build and check executable output**

Run:

```bash
pnpm build
head -n 1 dist/index.js
test -x dist/index.js
```

If TypeScript does not preserve executable mode, add a `postbuild` script using Node's `chmodSync('dist/index.js', 0o755)` rather than a platform-specific shell command.

- [ ] **Step 3: Write the subprocess smoke test**

Use `StdioClientTransport` with command `node`, args `['dist/index.js']`, and an environment that omits the API key. Connect an SDK `Client`, call `listTools()`, verify four tools, close the client, and assert stderr contains no secret-shaped text.

- [ ] **Step 4: Run the smoke test**

Run `pnpm exec vitest run tests/stdio.test.ts`.

Expected: PASS and child process exits cleanly.

---

### Task 7: Add public documentation, security policy, and CI

**Files:**

- Create: `README.md`
- Create: `SECURITY.md`
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Produces: copy-paste configuration for `npx -y @ai-watercolor-generator/mcp`.
- Produces: CI checks on Node 20 and 22.

- [x] **Step 1: Write README installation and configuration**

Lead with product capability, not implementation. Include official links to homepage, API docs, MCP docs and API key settings. Show a generic MCP configuration:

```json
{
  "mcpServers": {
    "ai-watercolor-generator": {
      "command": "npx",
      "args": ["-y", "@ai-watercolor-generator/mcp"],
      "env": {
        "AIWATERCOLOR_API_KEY": "YOUR_AIWATERCOLOR_API_KEY"
      }
    }
  }
}
```

Explain the upload → edit flow and generate/edit → get-task polling flow. Clearly state that image work consumes account credits and that keys must not be committed.

- [x] **Step 2: Add security and license files**

Use the standard MIT license with year 2026 and copyright holder `AI Watercolor Generator`. `SECURITY.md` must direct vulnerability reports to `https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp/security/advisories/new` and prohibit public issues containing API keys or sensitive images. Enable GitHub private vulnerability reporting after the repository is created.

- [x] **Step 3: Add CI**

Trigger on pushes and pull requests. Use `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm pack --dry-run`. Matrix Node 20 and 22; run pack only once on Node 22.

- [x] **Step 4: Add final package metadata**

Set:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp/issues"
  },
  "homepage": "https://www.aiwatercolorgenerator.com/docs/mcp",
  "license": "MIT",
  "keywords": [
    "mcp",
    "model-context-protocol",
    "watercolor",
    "ai-image-generation",
    "image-editing",
    "stdio"
  ]
}
```

- [x] **Step 5: Verify documentation and CI syntax**

Run `pnpm format:check` and inspect every README link with `curl -I`. Expected: formatting passes and official HTTPS links return 2xx/3xx.

---

### Task 8: Verify the release artifact and prepare publication metadata

**Files:**

- Create: `server.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-17-local-mcp-package.md`

**Interfaces:**

- Produces: npm tarball containing only intended runtime/docs files.
- Produces: Registry version `1.1.0` metadata ready to publish after npm exists.

- [x] **Step 1: Create combined Registry metadata**

Start from the production Registry entry and set version `1.1.0`. Keep the Streamable HTTP remote and add:

```json
{
  "registryType": "npm",
  "identifier": "@ai-watercolor-generator/mcp",
  "version": "0.1.0",
  "transport": {
    "type": "stdio"
  }
}
```

Add repository metadata for `https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp`. Do not publish this Registry version until both URLs are public.

- [x] **Step 2: Run the complete verification suite**

Run:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
mcp-publisher validate server.json
```

Expected: every command exits 0.

- [x] **Step 3: Inspect the tarball contents**

Run `pnpm pack`, inspect with `tar -tf`, then move the generated `.tgz` to Trash after inspection. The archive must contain `dist`, `README.md`, `LICENSE`, and `package.json`; it must not contain tests, `.env`, source maps with absolute local paths, design docs, Git metadata, or API keys.

- [x] **Step 4: Run deterministic secret scans**

Search the full project and packed file list for `awg_live_`, private-key markers, auth tokens, `.env`, and absolute local-user paths. Published examples must use unmistakable placeholders instead of key-shaped values.

- [x] **Step 5: Report external prerequisites**

Before any external mutation, report these remaining user actions:

1. Create GitHub Organization `AIWatercolorGenerator`.
2. Create npm Organization `ai-watercolor-generator` and grant the active npm account publish access.
3. Provide or create a dedicated low-credit production API key for end-to-end validation.
4. Approve GitHub repo creation/push, npm publication, and Registry `1.1.0` publication.

- [x] **Step 6: Mark the implementation checklist complete**

Check every task only after its tests pass. Do not create a Git commit; leave a cleanly reported working tree for explicit user approval.
