import { expect } from "vitest";
import { pnpmFixture } from "../fixtures";
import { getCliPath } from "../utils/get-cli-path";
import { runCliCommand } from "../utils/run-cli-command";

pnpmFixture("pnpm", async ({ testDirectory }) => {
  const { output, errorCode } = await runCliCommand({
    command: "npx",
    args: [getCliPath(), "--production"],
    cwd: testDirectory,
  });

  expect(errorCode).toBe(0);
  expect(output).toContain("77 licenses are compliant");
});
