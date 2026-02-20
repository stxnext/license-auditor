import path from "node:path";
import { normalizePythonPackageName, type ParsedRequirement } from "./requirements.js";

const UV_PINNED_REQUIREMENT_REGEX =
  /^([A-Za-z0-9_.-]+)(\[[A-Za-z0-9_,.-]+\])?==([^\s;]+)(?:\s*;.*)?$/;

type ParseUvExportRequirementsResult = {
  dependencies: ParsedRequirement[];
  warnings: string[];
};

export function parseUvExportRequirements({
  output,
  cwd,
}: {
  output: string;
  cwd: string;
}): ParseUvExportRequirementsResult {
  const sourceFile = path.join(cwd, "uv.lock");
  const dependencies: ParsedRequirement[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const logicalLines = foldContinuationLines(output);
  for (const logicalLine of logicalLines) {
    const line = stripComments(logicalLine).trim();
    if (!line || isUvDirectiveLine(line) || line.startsWith("--hash=")) {
      continue;
    }

    const normalizedLine = line
      .replace(/\s+--hash=[^\s]+/g, "")
      .trim();

    const match = normalizedLine.match(UV_PINNED_REQUIREMENT_REGEX);
    if (!match?.[1] || !match[3]) {
      warnings.push(`Unsupported uv export requirement line: ${line}`);
      continue;
    }

    const name = match[1];
    const version = match[3];
    const normalizedName = normalizePythonPackageName(name);
    const key = `${normalizedName}@${version}`;

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    dependencies.push({
      name,
      normalizedName,
      version,
      sourceFile,
    });
  }

  return {
    dependencies,
    warnings,
  };
}

function foldContinuationLines(output: string): string[] {
  const lines = output.split(/\r?\n/);
  const folded: string[] = [];
  let buffer = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (buffer) {
        folded.push(buffer.trim());
        buffer = "";
      }
      continue;
    }

    const hasContinuation = line.endsWith("\\");
    const segment = hasContinuation ? line.slice(0, -1).trimEnd() : line;

    buffer = buffer ? `${buffer} ${segment}` : segment;

    if (!hasContinuation) {
      folded.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer) {
    folded.push(buffer.trim());
  }

  return folded;
}

function stripComments(line: string): string {
  const hashIndex = line.indexOf("#");
  if (hashIndex === -1) {
    return line;
  }

  return line.slice(0, hashIndex);
}

function isUvDirectiveLine(line: string): boolean {
  return line.startsWith("--") && !line.startsWith("--hash=");
}
