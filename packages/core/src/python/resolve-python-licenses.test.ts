import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LICENSE_SOURCE } from "@license-auditor/data";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePythonLicenses } from "./resolve-python-licenses.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
  tmpDirs.length = 0;
});

describe("resolvePythonLicenses", () => {
  it("prefers License-Expression metadata and parses SPDX expression", async () => {
    const result = await resolvePythonLicenses({
      packagePath: "/virtual/site-packages/example",
      metadata: {
        licenseExpression: "MIT OR Apache-2.0",
        license: undefined,
        classifiers: [],
      },
      explicitLicensePaths: [],
    });

    expect(result.licensesWithPath.licenseExpression).toBe("MIT OR Apache-2.0");
    expect(result.licensesWithPath.licenses.map((license) => license.licenseId)).toEqual(
      expect.arrayContaining(["MIT", "Apache-2.0"]),
    );
    expect(result.licensesWithPath.licenses.every((license) =>
      license.source === LICENSE_SOURCE.pythonMetadataLicenseExpression
    )).toBe(true);
  });

  it("maps license classifier to SPDX IDs using curated mapping", async () => {
    const result = await resolvePythonLicenses({
      packagePath: "/virtual/site-packages/example",
      metadata: {
        licenseExpression: undefined,
        license: undefined,
        classifiers: ["License :: OSI Approved :: MIT License"],
      },
      explicitLicensePaths: [],
    });

    expect(result.licensesWithPath.licenses).toHaveLength(1);
    expect(result.licensesWithPath.licenses[0]?.licenseId).toBe("MIT");
    expect(result.licensesWithPath.licenses[0]?.source).toBe(
      LICENSE_SOURCE.pythonMetadataClassifierMapped,
    );
  });

  it("falls back to license file detection when metadata fields are empty", async () => {
    const cwd = await createProject();
    const licensePath = path.join(cwd, "LICENSE");
    await fs.writeFile(licensePath, "MIT License");

    const result = await resolvePythonLicenses({
      packagePath: cwd,
      metadata: {
        classifiers: [],
      },
      explicitLicensePaths: [licensePath],
    });

    expect(result.licensesWithPath.licenses.map((license) => license.licenseId)).toContain(
      "MIT",
    );
    expect(result.metadataSource).toBe("license-file");
  });

  it("returns unresolved status when nothing can be resolved", async () => {
    const result = await resolvePythonLicenses({
      packagePath: "/virtual/site-packages/unknown",
      metadata: {
        classifiers: [],
      },
      explicitLicensePaths: [],
    });

    expect(result.licensesWithPath.licenses).toHaveLength(0);
    expect(result.licensesWithPath.verificationStatus).toBe("licenseFileNotFound");
  });
});

async function createProject(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-python-license-test-"));
  tmpDirs.push(directory);
  return directory;
}
