import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UnsupportedPackageManagerException } from "../exceptions/unsupported-package-manager.exception.js";
import { findDependencies } from "./find-dependencies.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
  tmpDirs.length = 0;
});

describe("findDependencies", () => {
  it("resolves transitive dependencies and workspace packages", async () => {
    const projectRoot = await createProject();

    await writePackageJson(projectRoot, {
      name: "root",
      workspaces: ["packages/*"],
      dependencies: {
        "dep-a": "1.0.0",
        "workspace-a": "workspace:*",
      },
      devDependencies: {
        "dep-dev": "1.0.0",
      },
    });

    await writePackageJson(path.join(projectRoot, "packages", "workspace-a"), {
      name: "workspace-a",
      dependencies: {
        "dep-c": "1.0.0",
      },
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-a"), {
      name: "dep-a",
      dependencies: {
        "dep-b": "1.0.0",
      },
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-b"), {
      name: "dep-b",
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-c"), {
      name: "dep-c",
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-dev"), {
      name: "dep-dev",
    });

    const result = await findDependencies({
      projectRoot,
      production: false,
    });

    const dependencyNames = await getDependencyNames(result.dependencies);

    expect(dependencyNames).toEqual(
      expect.arrayContaining(["dep-a", "dep-b", "dep-c", "dep-dev"]),
    );
    expect(dependencyNames).not.toContain("workspace-a");
  });

  it("excludes devDependencies when production flag is enabled", async () => {
    const projectRoot = await createProject();

    await writePackageJson(projectRoot, {
      name: "root",
      dependencies: {
        "dep-a": "1.0.0",
      },
      devDependencies: {
        "dep-dev": "1.0.0",
      },
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-a"), {
      name: "dep-a",
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-dev"), {
      name: "dep-dev",
    });

    const result = await findDependencies({
      projectRoot,
      production: true,
    });

    const dependencyNames = await getDependencyNames(result.dependencies);

    expect(dependencyNames).toContain("dep-a");
    expect(dependencyNames).not.toContain("dep-dev");
  });

  it("throws for Yarn Plug'n'Play projects", async () => {
    const projectRoot = await createProject();
    await writePackageJson(projectRoot, {
      name: "root",
    });

    await fs.writeFile(path.join(projectRoot, ".pnp.cjs"), "module.exports = {};", "utf8");

    await expect(
      findDependencies({
        projectRoot,
      }),
    ).rejects.toBeInstanceOf(UnsupportedPackageManagerException);
  });

  it("resolves nested transitive dependencies", async () => {
    const projectRoot = await createProject();

    await writePackageJson(projectRoot, {
      name: "root",
      dependencies: {
        "dep-a": "1.0.0",
      },
    });

    await writePackageJson(path.join(projectRoot, "node_modules", "dep-a"), {
      name: "dep-a",
      dependencies: {
        "dep-b": "1.0.0",
      },
    });

    await writePackageJson(
      path.join(projectRoot, "node_modules", "dep-a", "node_modules", "dep-b"),
      {
        name: "dep-b",
      },
    );

    const result = await findDependencies({
      projectRoot,
      production: true,
    });

    const dependencyNames = await getDependencyNames(result.dependencies);

    expect(dependencyNames).toEqual(expect.arrayContaining(["dep-a", "dep-b"]));
    expect(result.warning).toBeUndefined();
  });

  it("returns warning when required dependencies are missing", async () => {
    const projectRoot = await createProject();

    await writePackageJson(projectRoot, {
      name: "root",
      dependencies: {
        "missing-dep": "1.0.0",
      },
    });

    const result = await findDependencies({
      projectRoot,
      production: true,
    });

    expect(result.dependencies).toHaveLength(0);
    expect(result.warning).toContain("missing-dep");
    expect(result.warning).toContain("required by root");
  });

  it("does not warn for missing optional dependencies", async () => {
    const projectRoot = await createProject();

    await writePackageJson(projectRoot, {
      name: "root",
      optionalDependencies: {
        "optional-missing-dep": "1.0.0",
      },
    });

    const result = await findDependencies({
      projectRoot,
      production: true,
    });

    expect(result.dependencies).toHaveLength(0);
    expect(result.warning).toBeUndefined();
  });

  it("does not resolve dependencies from parent directories", async () => {
    const parentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lac-core-parent-"));
    tmpDirs.push(parentRoot);

    const projectRoot = path.join(parentRoot, "project");
    await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });

    await writePackageJson(projectRoot, {
      name: "root",
      dependencies: {
        "dep-from-parent": "1.0.0",
      },
    });

    await writePackageJson(path.join(parentRoot, "node_modules", "dep-from-parent"), {
      name: "dep-from-parent",
    });

    const result = await findDependencies({
      projectRoot,
      production: true,
    });

    expect(result.dependencies).toHaveLength(0);
    expect(result.warning).toContain("dep-from-parent");
  });
});

async function createProject() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lac-core-test-"));
  tmpDirs.push(projectRoot);

  await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });

  return projectRoot;
}

async function writePackageJson(directory: string, data: Record<string, unknown>) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
}

async function getDependencyNames(dependencyPaths: string[]) {
  const packageJsonContents = await Promise.all(
    dependencyPaths.map(async (dependencyPath) => {
      const packageJsonPath = path.join(dependencyPath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(content) as { name?: string };
      return packageJson.name ?? path.basename(dependencyPath);
    }),
  );

  return packageJsonContents;
}
