import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("reports the version from the installed package manifest", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "watercolor-mcp-"));
    const distPath = join(packageRoot, "dist");
    await cp("dist", distPath, { recursive: true });
    await symlink(
      join(process.cwd(), "node_modules"),
      join(packageRoot, "node_modules"),
      "dir",
    );
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({ type: "module", version: "9.8.7" }),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(distPath, "index.js")],
      cwd: packageRoot,
      env: getDefaultEnvironment(),
      stderr: "pipe",
    });
    const client = new Client({
      name: "stdio-version-test",
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.version).toBe("9.8.7");
    } finally {
      await client.close();
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
});
