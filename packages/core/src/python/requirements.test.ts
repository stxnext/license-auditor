import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverRequirementsFiles,
  normalizePythonPackageName,
  parseRequirementsFiles,
} from "./requirements.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
  tmpDirs.length = 0;
});

describe("requirements parser", () => {
  it("discovers requirements.txt and requirements/*.txt files", async () => {
    const cwd = await createProject();
    await fs.writeFile(path.join(cwd, "requirements.txt"), "requests==2.31.0\n");
    await fs.mkdir(path.join(cwd, "requirements"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "requirements", "dev.txt"),
      "pytest==8.3.4\n",
    );
    await fs.writeFile(path.join(cwd, "requirements", "README.md"), "");

    const files = await discoverRequirementsFiles(cwd);

    expect(files).toHaveLength(2);
    expect(files).toEqual(
      expect.arrayContaining([
        path.join(cwd, "requirements.txt"),
        path.join(cwd, "requirements", "dev.txt"),
      ]),
    );
  });

  it("parses pinned requirements with extras, markers, and comments", async () => {
    const cwd = await createProject();
    const requirementsPath = path.join(cwd, "requirements.txt");

    await fs.writeFile(
      requirementsPath,
      [
        "# comment",
        "requests[socks]==2.31.0",
        "urllib3==2.2.2 ; python_version >= '3.10'",
        "pydantic==2.9.2 # inline comment",
      ].join("\n"),
    );

    const result = await parseRequirementsFiles({
      cwd,
      files: [requirementsPath],
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.unsupportedRequirements).toHaveLength(0);
    expect(result.requirements).toHaveLength(3);
    expect(result.requirements).toEqual(
      expect.arrayContaining([
        {
          name: "requests",
          normalizedName: "requests",
          version: "2.31.0",
          sourceFile: requirementsPath,
        },
        {
          name: "urllib3",
          normalizedName: "urllib3",
          version: "2.2.2",
          sourceFile: requirementsPath,
        },
        {
          name: "pydantic",
          normalizedName: "pydantic",
          version: "2.9.2",
          sourceFile: requirementsPath,
        },
      ]),
    );
  });

  it("parses recursive requirement includes and deduplicates dependencies", async () => {
    const cwd = await createProject();
    const requirementsPath = path.join(cwd, "requirements.txt");
    const nestedPath = path.join(cwd, "requirements-dev.txt");

    await fs.writeFile(
      requirementsPath,
      ["requests==2.31.0", "--requirement requirements-dev.txt"].join("\n"),
    );
    await fs.writeFile(
      nestedPath,
      ["requests==2.31.0", "pytest==8.3.4"].join("\n"),
    );

    const result = await parseRequirementsFiles({
      cwd,
      files: [requirementsPath],
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements).toEqual(
      expect.arrayContaining([
        {
          name: "requests",
          normalizedName: "requests",
          version: "2.31.0",
          sourceFile: requirementsPath,
        },
        {
          name: "pytest",
          normalizedName: "pytest",
          version: "8.3.4",
          sourceFile: nestedPath,
        },
      ]),
    );
  });

  it("tracks unsupported requirement specs and warns", async () => {
    const cwd = await createProject();
    const requirementsPath = path.join(cwd, "requirements.txt");

    await fs.writeFile(
      requirementsPath,
      ["requests>=2.0", "git+https://github.com/pallets/flask.git"].join("\n"),
    );

    const result = await parseRequirementsFiles({
      cwd,
      files: [requirementsPath],
    });

    expect(result.requirements).toHaveLength(0);
    expect(result.warnings).toHaveLength(2);
    expect(result.unsupportedRequirements).toHaveLength(2);
    expect(result.unsupportedRequirements[0]?.packageName).toBe("requests");
    expect(result.unsupportedRequirements[1]?.packageName).toBe("git");
  });

  it("warns when an included requirements file does not exist", async () => {
    const cwd = await createProject();
    const requirementsPath = path.join(cwd, "requirements.txt");

    await fs.writeFile(requirementsPath, "-r missing.txt\n");

    const result = await parseRequirementsFiles({
      cwd,
      files: [requirementsPath],
    });

    expect(result.requirements).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Requirements include not found")]),
    );
  });
});

describe("normalizePythonPackageName", () => {
  it("normalizes separators and casing", () => {
    expect(normalizePythonPackageName("My_Package.Name")).toBe("my-package-name");
  });
});

async function createProject(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-requirements-test-"));
  tmpDirs.push(directory);
  return directory;
}
