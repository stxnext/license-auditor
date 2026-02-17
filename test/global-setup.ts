import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterAll, beforeAll } from "vitest";
import { execAsync } from "./utils/exec-async";

export type TestContext = {
  testDirectory: string;
};

export const TEST_PROJECTS_DIRECTORY = path.resolve(
  __dirname,
  "./testProjects",
);
export const TEST_TEMP_DIRECTORY = path.resolve(__dirname, "./temp");

const exists = async (path: string) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

const getInstallCommand = async (projectDirectory: string) => {
  const packageJsonPath = path.resolve(projectDirectory, "package.json");
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as { packageManager?: string };

  if (
    packageJson.packageManager?.startsWith("bun@") ||
    (await exists(path.resolve(projectDirectory, "bun.lock"))) ||
    (await exists(path.resolve(projectDirectory, "bun.lockb")))
  ) {
    return "bun install";
  }

  if (await exists(path.resolve(projectDirectory, "pnpm-lock.yaml"))) {
    const pnpmLocalPath = path.resolve(
      __dirname,
      "..",
      "node_modules",
      ".bin",
      "pnpm",
    );

    return `${pnpmLocalPath} i`;
  }

  if (await exists(path.resolve(projectDirectory, "yarn.lock"))) {
    const yarnLocalPath = path.resolve(
      __dirname,
      "..",
      "node_modules",
      ".bin",
      "yarn",
    );

    return `${yarnLocalPath} install`;
  }
  return "npm i";
};

const prepareTestProject = async (projectDirectory: string) => {
  await fs.copyFile(
    path.resolve(
      __dirname,
      "../packages/cli/public/template/default/license-auditor.config.ts",
    ),
    path.resolve(projectDirectory, "license-auditor.config.ts"),
  );

  const installCommand = await getInstallCommand(projectDirectory);

  await execAsync(installCommand, { cwd: projectDirectory });
};
const cleanUpTestProjects = async (projectDirectory: string) => {
  await fs.rm(path.resolve(projectDirectory, "node_modules"), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.resolve(projectDirectory, "license-auditor.config.ts"), {
    force: true,
  });
};

export const setup = async () => {
  const results = await fs.readdir(TEST_PROJECTS_DIRECTORY, {
    withFileTypes: true,
  });
  for (const result of results) {
    if (result.isDirectory()) {
      await prepareTestProject(
        path.resolve(TEST_PROJECTS_DIRECTORY, result.name),
      );
    }
  }

  await fs.mkdir(path.resolve(__dirname, "temp"), { recursive: true });
};

export const teardown = async () => {
  const results = await fs.readdir(TEST_PROJECTS_DIRECTORY, {
    withFileTypes: true,
  });
  for (const result of results) {
    if (result.isDirectory()) {
      await cleanUpTestProjects(
        path.resolve(TEST_PROJECTS_DIRECTORY, result.name),
      );
    }
  }
  await fs.rm(path.resolve(__dirname, "temp"), {
    recursive: true,
    force: true,
  });
};
