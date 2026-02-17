import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ValidateJsonPathException } from "@brainhubeu/license-auditor-core";
import { validateJsonPath } from "./validate-json-path.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
  tmpDirs.length = 0;
});

describe("validateJsonPath", () => {
  it("returns undefined when JSON output is disabled", async () => {
    await expect(validateJsonPath(undefined)).resolves.toBeUndefined();
  });

  it("throws for missing parent directory", async () => {
    const targetPath = path.join(os.tmpdir(), "lac-missing", "result.json");

    await expect(validateJsonPath(targetPath)).rejects.toBeInstanceOf(
      ValidateJsonPathException,
    );
  });

  it("uses default file name when directory is provided", async () => {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-json-"));
    tmpDirs.push(tempDirectory);

    const result = await validateJsonPath(tempDirectory);

    expect(result).toBe(path.join(tempDirectory, "license-auditor.results.json"));
  });
});
