import { expect } from "vitest";
import { bunFixture } from "../fixtures";
import { getCliPath } from "../utils/get-cli-path";
import { runCliCommand } from "../utils/run-cli-command";

bunFixture("bun", async ({ testDirectory }) => {
  const { output, errorCode } = await runCliCommand({
    command: "npx",
    args: [getCliPath(), "--production"],
    cwd: testDirectory,
  });

  expect(errorCode).toBe(0);
  expect(output).toContain("No licenses found");
  expect(output).toContain("1 package is requiring manual checking");
});
