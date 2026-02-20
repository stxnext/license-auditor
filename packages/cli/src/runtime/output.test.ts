import type { LicenseAuditResult } from "@license-auditor/data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printAuditOutput } from "./output.js";

describe("printAuditOutput strict mode", () => {
  const warningMessage =
    "Some declared dependencies could not be resolved from node_modules (1): missing-dep";

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("does not fail when warning is present and strict mode is disabled", () => {
    printAuditOutput(createEmptyResult(), {
      verbose: false,
      strict: false,
      production: false,
      filter: undefined,
      bail: undefined,
      warning: warningMessage,
      overrides: {},
    });

    expect(process.exitCode).toBe(0);
  });

  it("fails when warning is present and strict mode is enabled", () => {
    printAuditOutput(createEmptyResult(), {
      verbose: false,
      strict: true,
      production: false,
      filter: undefined,
      bail: undefined,
      warning: warningMessage,
      overrides: {},
    });

    expect(process.exitCode).toBe(1);
    expect(consoleSpy.mock.calls.flat().join("\n")).toContain(
      "Strict mode enabled: dependency resolution warnings are treated as failures.",
    );
  });

  it("does not fail when strict mode is enabled and warning is absent", () => {
    printAuditOutput(createEmptyResult(), {
      verbose: false,
      strict: true,
      production: false,
      filter: undefined,
      bail: undefined,
      warning: undefined,
      overrides: {},
    });

    expect(process.exitCode).toBe(0);
  });

  it("prints production-specific no-license hint when production mode is enabled", () => {
    printAuditOutput(createEmptyResult(), {
      verbose: false,
      strict: false,
      production: true,
      filter: undefined,
      bail: undefined,
      warning: undefined,
      overrides: {},
    });

    expect(consoleSpy.mock.calls.flat().join("\n")).toContain(
      "No licenses found in production dependencies",
    );
  });
});

function createEmptyResult(): LicenseAuditResult {
  return {
    groupedByStatus: {
      whitelist: [],
      blacklist: [],
      unknown: [],
    },
    notFound: new Map(),
    overrides: {
      notFoundOverrides: [],
    },
    needsUserVerification: new Map(),
    errorResults: new Map(),
  };
}
