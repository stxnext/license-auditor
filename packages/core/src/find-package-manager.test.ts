import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findPackageManager } from "./find-package-manager.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
  tmpDirs.length = 0;
});

describe("findPackageManager", () => {
  it("detects bun by lock file", async () => {
    const projectRoot = await createProject();
    await fs.writeFile(path.join(projectRoot, "bun.lock"), "", "utf8");

    await expect(findPackageManager(projectRoot)).resolves.toBe("bun");
  });

  it("detects yarn classic from packageManager field", async () => {
    const projectRoot = await createProject();
    await fs.writeFile(path.join(projectRoot, "yarn.lock"), "", "utf8");
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      '{"name":"test","packageManager":"yarn@1.22.22"}',
      "utf8",
    );

    await expect(findPackageManager(projectRoot)).resolves.toBe("yarn-classic");
  });

  it("falls back to unknown", async () => {
    const projectRoot = await createProject();

    await expect(findPackageManager(projectRoot)).resolves.toBe("unknown");
  });
});

async function createProject() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lac-pm-test-"));
  tmpDirs.push(projectRoot);
  return projectRoot;
}
