import fs from "node:fs";
import path from "node:path";
import type { Ecosystem } from "@license-auditor/data";

export type ResolvedAuditEcosystem = "node" | "python" | "both";

export function resolveAuditEcosystem({
  cwd,
  cliEcosystem,
  configEcosystem,
}: {
  cwd: string;
  cliEcosystem?: Ecosystem | undefined;
  configEcosystem?: Ecosystem | undefined;
}): ResolvedAuditEcosystem {
  const requested = cliEcosystem ?? configEcosystem ?? "auto";

  if (requested === "node") {
    return "node";
  }

  if (requested === "python") {
    return "python";
  }

  if (requested === "both") {
    return "both";
  }

  const detection = detectAvailableEcosystems(cwd);

  if (detection.hasNode && detection.hasPython) {
    throw new Error(
      [
        "Detected both Node and Python project signals.",
        "Set ecosystem in config (ecosystem: \"node\" | \"python\" | \"both\") or pass --ecosystem.",
      ].join(" "),
    );
  }

  if (detection.hasPython) {
    return "python";
  }

  return "node";
}

function detectAvailableEcosystems(cwd: string): {
  hasNode: boolean;
  hasPython: boolean;
} {
  const hasNode =
    fs.existsSync(path.join(cwd, "package.json")) ||
    fs.existsSync(path.join(cwd, "node_modules")) ||
    fs.existsSync(path.join(cwd, "package-lock.json")) ||
    fs.existsSync(path.join(cwd, "pnpm-lock.yaml")) ||
    fs.existsSync(path.join(cwd, "yarn.lock")) ||
    fs.existsSync(path.join(cwd, "bun.lock")) ||
    fs.existsSync(path.join(cwd, "bun.lockb"));

  const hasPython =
    fs.existsSync(path.join(cwd, "pyproject.toml")) ||
    fs.existsSync(path.join(cwd, "uv.lock")) ||
    fs.existsSync(path.join(cwd, "requirements.txt")) ||
    fs.existsSync(path.join(cwd, ".venv")) ||
    hasRequirementsDirectory(cwd);

  return {
    hasNode,
    hasPython,
  };
}

function hasRequirementsDirectory(cwd: string): boolean {
  const requirementsDir = path.join(cwd, "requirements");

  try {
    if (!fs.statSync(requirementsDir).isDirectory()) {
      return false;
    }

    return fs
      .readdirSync(requirementsDir)
      .some((entry) => entry.toLowerCase().endsWith(".txt"));
  } catch {
    return false;
  }
}
