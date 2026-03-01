import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expect } from "vitest";
import { defaultTest } from "../fixtures";
import { getCliPath } from "../utils/get-cli-path";
import { runCliCommand } from "../utils/run-cli-command";

defaultTest(
  "strict mode fails when dependency resolution warning is present",
  async ({ testDirectory }) => {
    const packageJsonPath = path.join(testDirectory, "package.json");
    const packageJsonRaw = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>;
    };

    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      "license-auditor-missing-package": "1.0.0",
    };

    await fs.writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf-8",
    );

    const warningRun = await runCliCommand({
      command: "npx",
      args: [getCliPath()],
      cwd: testDirectory,
    });

    expect(warningRun.errorCode).toBe(0);
    expect(warningRun.output).toContain(
      "Some declared dependencies could not be resolved from node_modules",
    );

    const strictRun = await runCliCommand({
      command: "npx",
      args: [getCliPath(), "--strict"],
      cwd: testDirectory,
    });

    expect(strictRun.errorCode).toBe(1);
    expect(strictRun.output).toContain(
      "Some declared dependencies could not be resolved from node_modules",
    );
    expect(strictRun.output).toContain(
      "Strict mode enabled: dependency resolution warnings are treated as failures.",
    );
  },
);
