import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readConfiguration } from "./read-configuration.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
  tmpDirs.length = 0;

  delete (globalThis as { Bun?: unknown }).Bun;
});

describe("readConfiguration", () => {
  it("loads JSON configuration and strips $schema", async () => {
    const projectRoot = await createProjectDirectory();

    await fs.writeFile(
      path.join(projectRoot, ".license-auditorrc.json"),
      JSON.stringify(
        {
          $schema: "./schema.json",
          whitelist: ["MIT"],
          blacklist: ["GPL-3.0-only"],
          overrides: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await readConfiguration(projectRoot);

    expect(result).not.toBeNull();
    expect(result?.filepath).toContain(".license-auditorrc.json");
    expect(result?.config).toEqual({
      whitelist: ["MIT"],
      blacklist: ["GPL-3.0-only"],
      overrides: {},
    });
  });

  it("loads YAML configuration in Bun runtime", async () => {
    const projectRoot = await createProjectDirectory();

    await fs.writeFile(
      path.join(projectRoot, "license-auditor.config.yaml"),
      "whitelist: []\nblacklist: []\noverrides: {}\n",
      "utf8",
    );

    (globalThis as { Bun?: { YAML: { parse: (input: string) => unknown } } }).Bun =
      {
        YAML: {
          parse: () => ({
            whitelist: ["MIT"],
            blacklist: ["GPL-3.0-only"],
            overrides: {},
          }),
        },
      };

    const result = await readConfiguration(projectRoot);

    expect(result).not.toBeNull();
    expect(result?.config.whitelist).toEqual(["MIT"]);
  });

  it("returns null when configuration file does not exist", async () => {
    const projectRoot = await createProjectDirectory();

    const result = await readConfiguration(projectRoot);

    expect(result).toBeNull();
  });
});

async function createProjectDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-cli-config-"));
  tmpDirs.push(directory);
  return directory;
}
