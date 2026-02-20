import fs from "node:fs/promises";
import path from "node:path";

export type ParsedRequirement = {
  name: string;
  normalizedName: string;
  version: string;
  sourceFile: string;
};

export type RequirementsParseResult = {
  requirements: ParsedRequirement[];
  warnings: string[];
  unsupportedRequirements: UnsupportedRequirement[];
};

const PINNED_REQUIREMENT_REGEX =
  /^([A-Za-z0-9_.-]+)(\[[A-Za-z0-9_,.-]+\])?==([^\s;]+)(?:\s*;.*)?$/;

const INCLUDE_REGEX = /^(?:-r|--requirement)\s+(.+)$/i;

export type UnsupportedRequirement = {
  rawLine: string;
  sourceFile: string;
  packageName?: string | undefined;
};

export async function discoverRequirementsFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];

  const rootRequirements = path.join(cwd, "requirements.txt");
  if (await exists(rootRequirements)) {
    files.push(rootRequirements);
  }

  const requirementsDir = path.join(cwd, "requirements");
  if (await exists(requirementsDir)) {
    try {
      const entries = await fs.readdir(requirementsDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
          files.push(path.join(requirementsDir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  }

  return files;
}

export async function parseRequirementsFiles({
  cwd,
  files,
}: {
  cwd: string;
  files: string[];
}): Promise<RequirementsParseResult> {
  const parsed = new Map<string, ParsedRequirement>();
  const warnings: string[] = [];
  const unsupportedRequirements: UnsupportedRequirement[] = [];
  const visited = new Set<string>();

  for (const file of files) {
    const resolvedFile = path.isAbsolute(file) ? file : path.resolve(cwd, file);
    await parseSingleFile({
      cwd,
      filePath: resolvedFile,
      parsed,
      warnings,
      unsupportedRequirements,
      visited,
    });
  }

  return {
    requirements: [...parsed.values()],
    warnings,
    unsupportedRequirements,
  };
}

async function parseSingleFile({
  cwd,
  filePath,
  parsed,
  warnings,
  unsupportedRequirements,
  visited,
}: {
  cwd: string;
  filePath: string;
  parsed: Map<string, ParsedRequirement>;
  warnings: string[];
  unsupportedRequirements: UnsupportedRequirement[];
  visited: Set<string>;
}): Promise<void> {
  if (visited.has(filePath)) {
    return;
  }
  visited.add(filePath);

  if (!(await exists(filePath))) {
    warnings.push(`Requirements include not found: ${filePath}`);
    return;
  }

  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripComments(rawLine).trim();

    if (!line) {
      continue;
    }

    const includeMatch = line.match(INCLUDE_REGEX);
    if (includeMatch?.[1]) {
      const includeTarget = includeMatch[1].trim();
      const resolvedInclude = path.isAbsolute(includeTarget)
        ? includeTarget
        : path.resolve(path.dirname(filePath), includeTarget);

      await parseSingleFile({
        cwd,
        filePath: resolvedInclude,
        parsed,
        warnings,
        unsupportedRequirements,
        visited,
      });
      continue;
    }

    const pinnedMatch = line.match(PINNED_REQUIREMENT_REGEX);
    if (!pinnedMatch) {
      warnings.push(
        `Unsupported requirement spec in ${path.relative(cwd, filePath)}: ${line}`,
      );
      unsupportedRequirements.push({
        rawLine: line,
        sourceFile: filePath,
        packageName: guessPackageNameFromLine(line),
      });
      continue;
    }

    const [, rawName, , version] = pinnedMatch;

    if (!rawName || !version) {
      warnings.push(
        `Unsupported requirement spec in ${path.relative(cwd, filePath)}: ${line}`,
      );
      unsupportedRequirements.push({
        rawLine: line,
        sourceFile: filePath,
        packageName: guessPackageNameFromLine(line),
      });
      continue;
    }

    const normalizedName = normalizePythonPackageName(rawName);
    const key = `${normalizedName}@${version}`;

    if (!parsed.has(key)) {
      parsed.set(key, {
        name: rawName,
        normalizedName,
        version,
        sourceFile: filePath,
      });
    }
  }
}

function stripComments(line: string): string {
  const hashIndex = line.indexOf("#");
  if (hashIndex === -1) {
    return line;
  }

  return line.slice(0, hashIndex);
}

async function exists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

export function normalizePythonPackageName(packageName: string): string {
  return packageName.toLowerCase().replace(/[_.-]+/g, "-");
}

function guessPackageNameFromLine(line: string): string | undefined {
  const match = line.match(/^([A-Za-z0-9_.-]+)/);
  return match?.[1];
}
