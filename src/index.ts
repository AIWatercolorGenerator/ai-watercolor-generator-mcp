#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createApiClient } from "./api-client.js";
import { createWatercolorMcpServer } from "./server.js";

async function main() {
  const apiClient = createApiClient({
    apiKey: process.env.AIWATERCOLOR_API_KEY?.trim() ?? "",
  });
  const server = createWatercolorMcpServer(apiClient);
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  process.stderr.write("AI Watercolor Generator MCP failed to start.\n");
  process.exitCode = 1;
});
