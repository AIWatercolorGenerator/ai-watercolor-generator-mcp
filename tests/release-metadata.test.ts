import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type PackageManifest = {
  version: string;
  mcpName?: string;
};

type RegistryManifest = {
  packages?: Array<{
    identifier: string;
    version?: string;
    environmentVariables?: Array<{
      name: string;
      isRequired?: boolean;
      isSecret?: boolean;
    }>;
  }>;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("release metadata", () => {
  it("links the npm package to the canonical MCP name and package version", async () => {
    const packageManifest = await readJson<PackageManifest>("package.json");
    const registryManifest = await readJson<RegistryManifest>("server.json");
    const npmPackage = registryManifest.packages?.find(
      (entry) => entry.identifier === "@ai-watercolor-generator/mcp",
    );

    expect(packageManifest.mcpName).toBe(
      "com.aiwatercolorgenerator/watercolor",
    );
    expect(npmPackage?.version).toBe(packageManifest.version);
  });

  it("declares the required API key for Registry-installed stdio clients", async () => {
    const registryManifest = await readJson<RegistryManifest>("server.json");
    const npmPackage = registryManifest.packages?.find(
      (entry) => entry.identifier === "@ai-watercolor-generator/mcp",
    );
    const apiKey = npmPackage?.environmentVariables?.find(
      (variable) => variable.name === "AIWATERCOLOR_API_KEY",
    );

    expect(apiKey).toMatchObject({ isRequired: true, isSecret: true });
  });
});
