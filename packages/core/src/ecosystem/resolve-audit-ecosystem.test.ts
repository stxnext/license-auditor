import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAuditEcosystem } from "./resolve-audit-ecosystem.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
  tmpDirs.length = 0;
});

describe("resolveAuditEcosystem", () => {
  it("uses cli ecosystem over config ecosystem", async () => {
    const cwd = await createProject();

    const ecosystem = resolveAuditEcosystem({
      cwd,
      cliEcosystem: "python",
      configEcosystem: "node",
    });

    expect(ecosystem).toBe("python");
  });

  it("uses config ecosystem over auto-detection", async () => {
    const cwd = await createProject();
    await fs.writeFile(path.join(cwd, "pyproject.toml"), "[project]\nname='test'\n");

    const ecosystem = resolveAuditEcosystem({
      cwd,
      configEcosystem: "node",
    });

    expect(ecosystem).toBe("node");
  });

  it("auto-detects python project", async () => {
    const cwd = await createProject();
    await fs.writeFile(path.join(cwd, "pyproject.toml"), "[project]\nname='test'\n");

    const ecosystem = resolveAuditEcosystem({ cwd });

    expect(ecosystem).toBe("python");
  });

  it("auto-detects node project", async () => {
    const cwd = await createProject();
    await fs.writeFile(path.join(cwd, "package.json"), '{"name":"test"}\n');

    const ecosystem = resolveAuditEcosystem({ cwd });

    expect(ecosystem).toBe("node");
  });

  it("fails in auto mode when both node and python signals are detected", async () => {
    const cwd = await createProject();
    await fs.writeFile(path.join(cwd, "package.json"), '{"name":"test"}\n');
    await fs.writeFile(path.join(cwd, "pyproject.toml"), "[project]\nname='test'\n");

    expect(() => resolveAuditEcosystem({ cwd })).toThrowError(
      /Detected both Node and Python project signals/,
    );
  });

  it("returns both when explicitly requested", async () => {
    const cwd = await createProject();

    const ecosystem = resolveAuditEcosystem({
      cwd,
      cliEcosystem: "both",
    });

    expect(ecosystem).toBe("both");
  });

  it("defaults to node when auto mode finds no ecosystem signals", async () => {
    const cwd = await createProject();

    const ecosystem = resolveAuditEcosystem({ cwd });

    expect(ecosystem).toBe("node");
  });
});

async function createProject(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-ecosystem-test-"));
  tmpDirs.push(directory);
  return directory;
}
