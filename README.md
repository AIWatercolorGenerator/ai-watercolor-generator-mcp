# AI Watercolor Generator MCP

[![npm version](https://img.shields.io/npm/v/@ai-watercolor-generator/mcp)](https://www.npmjs.com/package/@ai-watercolor-generator/mcp)
[![CI](https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/AIWatercolorGenerator/ai-watercolor-generator-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-com.aiwatercolorgenerator%2Fwatercolor-blue)](https://registry.modelcontextprotocol.io/?q=com.aiwatercolorgenerator%2Fwatercolor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Create watercolor art from text or transform local images with AI from any MCP client that supports local stdio servers.

This package is the official local MCP server for [AI Watercolor Generator](https://www.aiwatercolorgenerator.com). It is a small, open-source client for the production API: generation, storage, credits, rate limits, and task processing remain on the hosted service.

## Features

- Generate watercolor artwork from a text prompt.
- Upload a local JPEG, PNG, or WebP image for editing.
- Transform uploaded images into watercolor paintings.
- Poll asynchronous tasks until an output is ready.
- Use the same account and credits as the REST API and hosted MCP server.

## Requirements

- Node.js 20 or newer
- An [AI Watercolor Generator API key](https://www.aiwatercolorgenerator.com/settings/apikeys)
- Account credits for generation and editing

Keep your API key private. Do not commit it to a repository or paste it into an issue.

## Quick start

Run the MCP server through npm without a global installation:

```bash
AIWATERCOLOR_API_KEY=YOUR_AIWATERCOLOR_API_KEY \
  npx -y @ai-watercolor-generator/mcp
```

The process communicates over stdio, so it is normally launched by an MCP client rather than used interactively.

## Client configuration

### Codex

Codex CLI, the Codex IDE extension, and the ChatGPT desktop app share MCP configuration on the same Codex host. Add this to `~/.codex/config.toml` and provide `AIWATERCOLOR_API_KEY` in the environment that starts Codex:

```toml
[mcp_servers.ai_watercolor_generator]
command = "npx"
args = ["-y", "@ai-watercolor-generator/mcp"]
env_vars = ["AIWATERCOLOR_API_KEY"]
```

Restart the client, then run `codex mcp list` or use `/mcp` to verify the connection. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/).

### Cursor

Add this server to your project `.cursor/mcp.json` or global MCP configuration:

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

See the [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol).

### Claude Desktop and other JSON-based clients

Use the same stdio configuration in the client's local MCP settings:

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

Restart the client after saving. Claude Desktop may present local MCP servers through its Extensions interface; see Anthropic's [local MCP server guide](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) for the current setup flow.

## Tools

| Tool                      | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `generate_watercolor`     | Submit an asynchronous text-to-watercolor task                   |
| `upload_watercolor_input` | Upload a local JPEG, PNG, or WebP file up to 10 MiB              |
| `edit_watercolor`         | Submit an asynchronous watercolor edit using uploaded image URLs |
| `get_watercolor_task`     | Read task status, outputs, or failure details                    |

### Generate from text

Call `generate_watercolor` with a prompt. Optional fields are `model`, `aspect_ratio`, `resolution`, and `idempotency_key`.

```json
{
  "prompt": "A red cottage beside a quiet lake, soft wet-on-wet washes",
  "model": "watercolor-lite",
  "aspect_ratio": "4:3",
  "resolution": "1k"
}
```

The tool returns a task with status `queued` or `processing`. Call `get_watercolor_task` every 2–5 seconds until the status is `succeeded`, `failed`, or `canceled`.

### Edit a local image

First call `upload_watercolor_input` with an explicit local file path:

```json
{
  "file_path": "/absolute/path/to/source-image.png"
}
```

Then pass the returned `url` to `edit_watercolor`:

```json
{
  "prompt": "Preserve the composition with soft transparent watercolor washes",
  "input_images": [
    "https://cdn.aiwatercolorgenerator.com/api-inputs/.../upload.png"
  ],
  "model": "watercolor-lite",
  "aspect_ratio": "auto",
  "resolution": "1k"
}
```

The upload tool reads only the path explicitly supplied in the tool call. It does not scan directories or expand glob patterns. The image is uploaded to AI Watercolor Generator's trusted storage and is then processed by the hosted API.

## Models and credits

The API currently supports `watercolor-lite`, `nano-banana-2`, `nano-banana-pro`, and `gpt-image-2`. Model, resolution, and operation affect credit cost. Failed or canceled tasks receive the refund defined by the hosted API.

See the [API documentation](https://www.aiwatercolorgenerator.com/docs/api) for current models, credit costs, limits, error codes, and schemas.

## How it relates to the hosted MCP server

The official MCP Registry entry is `com.aiwatercolorgenerator/watercolor` and supports two installation styles:

- Hosted Streamable HTTP: `https://www.aiwatercolorgenerator.com/api/mcp`
- Local stdio: this npm package

Use the hosted endpoint when your client supports authenticated Streamable HTTP. Use this local package when you need stdio compatibility or want an MCP tool to upload a local image path.

## Security and privacy

- The API key is read from `AIWATERCOLOR_API_KEY` and is never intentionally logged.
- Local images are sent to the hosted upload API when you invoke `upload_watercolor_input`.
- Tool calls consume account credits and are subject to API rate and concurrency limits.
- Review file paths and tool calls before approving them in your MCP client.
- Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Development

```bash
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm pack --dry-run
```

The test suite mocks HTTP requests and includes a real subprocess handshake against the built stdio executable. No production API key is needed for normal development tests.

## Links

- [AI Watercolor Generator](https://www.aiwatercolorgenerator.com)
- [Create an API key](https://www.aiwatercolorgenerator.com/settings/apikeys)
- [REST API documentation](https://www.aiwatercolorgenerator.com/docs/api)
- [MCP documentation](https://www.aiwatercolorgenerator.com/docs/mcp)
- [OpenAPI document](https://www.aiwatercolorgenerator.com/api/openapi.json)
- [Official MCP Registry listing](https://registry.modelcontextprotocol.io/?q=com.aiwatercolorgenerator%2Fwatercolor)

## License

[MIT](LICENSE)
