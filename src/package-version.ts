import { createRequire } from "node:module";

const packageManifest = createRequire(import.meta.url)("../package.json") as {
  version?: unknown;
};

if (
  typeof packageManifest.version !== "string" ||
  packageManifest.version.length === 0
) {
  throw new Error("Package manifest has no valid version.");
}

export const packageVersion = packageManifest.version;
