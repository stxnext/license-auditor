import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseUvExportRequirements } from "./parse-uv-export-requirements.js";

describe("parseUvExportRequirements", () => {
  it("parses multiline requirements with hash lines", () => {
    const output = [
      "requests==2.31.0 \\",
      "  --hash=sha256:aaaa \\",
      "  --hash=sha256:bbbb",
      "idna==3.11 \\",
      "  --hash=sha256:cccc",
    ].join("\n");

    const result = parseUvExportRequirements({
      output,
      cwd: "/repo",
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.dependencies).toEqual([
      {
        name: "requests",
        normalizedName: "requests",
        version: "2.31.0",
        sourceFile: path.join("/repo", "uv.lock"),
      },
      {
        name: "idna",
        normalizedName: "idna",
        version: "3.11",
        sourceFile: path.join("/repo", "uv.lock"),
      },
    ]);
  });

  it("ignores uv export directives", () => {
    const output = [
      "--index-url https://pypi.org/simple",
      "--trusted-host pypi.org",
      "charset-normalizer==3.4.4",
    ].join("\n");

    const result = parseUvExportRequirements({
      output,
      cwd: "/repo",
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.dependencies).toEqual([
      {
        name: "charset-normalizer",
        normalizedName: "charset-normalizer",
        version: "3.4.4",
        sourceFile: path.join("/repo", "uv.lock"),
      },
    ]);
  });

  it("warns for unsupported requirement entries", () => {
    const output = [
      "requests>=2.31.0",
      "git+https://github.com/pallets/flask.git",
    ].join("\n");

    const result = parseUvExportRequirements({
      output,
      cwd: "/repo",
    });

    expect(result.dependencies).toHaveLength(0);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Unsupported uv export requirement line");
  });
});
