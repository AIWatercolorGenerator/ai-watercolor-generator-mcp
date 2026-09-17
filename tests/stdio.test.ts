import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

describe("published stdio executable", () => {
  it("initializes and lists tools without an API key", async () => {
    const environment = getDefaultEnvironment();
    delete environment.AIWATERCOLOR_API_KEY;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      cwd: process.cwd(),
      env: environment,
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client({
      name: "stdio-smoke-test",
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "edit_watercolor",
        "generate_watercolor",
        "get_watercolor_task",
        "upload_watercolor_input",
      ]);
      expect(stderr).not.toMatch(/awg_(?:live|test)_/i);
      expect(stderr).not.toContain("Authorization");
    } finally {
      await client.close();
    }
  });
});
