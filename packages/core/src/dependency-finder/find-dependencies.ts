import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { DependenciesResult } from "@license-auditor/data";
import { UnsupportedPackageManagerException } from "../exceptions/unsupported-package-manager.exception.js";

type RawPackageJson = {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type DependencyKind = "dependency" | "devDependency" | "optionalDependency";

type CollectedDependency = {
  name: string;
  kind: DependencyKind;
};

type DependencyResolutionResult = {
  paths: string[];
  warning?: string;
};

export async function findDependencies({
  projectRoot,
  production,
}: {
  projectRoot: string;
  production?: boolean | undefined;
  verbose?: boolean | undefined;
}): Promise<DependenciesResult> {
  if (fs.existsSync(path.join(projectRoot, ".pnp.cjs"))) {
    throw new UnsupportedPackageManagerException(
      "Yarn Plug'n'Play is currently not supported.",
    );
  }

  const workspaceDirs = await resolveWorkspacePackageDirs(projectRoot);
  const workspaceNameToPath = await mapWorkspaceNamesToDirs(workspaceDirs);
  const workspaceRealPaths = new Set(
    workspaceDirs.map((directory) => toRealPathOrFallback(directory)),
  );

  const dependencies = await resolveDependenciesRecursively({
    projectRoot,
    roots: workspaceDirs,
    workspaceNameToPath,
    workspaceRealPaths,
    production,
  });

  const result: DependenciesResult = {
    dependencies: dependencies.paths,
  };

  if (dependencies.warning) {
    result.warning = dependencies.warning;
  }

  return result;
}

async function resolveWorkspacePackageDirs(
  projectRoot: string,
): Promise<string[]> {
  const rootPackageJsonPath = path.join(projectRoot, "package.json");
  const rootPackageJson = readRawPackageJson(rootPackageJsonPath);

  const workspacePatterns = [
    ...extractWorkspacePatterns(rootPackageJson),
    ...(await readPnpmWorkspacePatterns(projectRoot)),
  ];

  const packageDirs = await collectPackageDirectories(projectRoot);

  const workspaceDirs = new Set<string>([projectRoot]);
  if (workspacePatterns.length === 0) {
    return [...workspaceDirs];
  }

  for (const packageDir of packageDirs) {
    const relativePath = path.relative(projectRoot, packageDir);

    if (
      workspacePatterns.some((pattern) =>
        matchWorkspacePattern(relativePath, normalizePattern(pattern)),
      )
    ) {
      workspaceDirs.add(packageDir);
    }
  }

  return [...workspaceDirs];
}

function normalizePattern(pattern: string): string {
  return pattern
    .trim()
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function extractWorkspacePatterns(packageJson: RawPackageJson): string[] {
  if (!packageJson.workspaces) {
    return [];
  }

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces.filter((workspace) => workspace.trim() !== "");
  }

  return (
    packageJson.workspaces.packages?.filter(
      (workspace) => workspace.trim() !== "",
    ) ?? []
  );
}

async function readPnpmWorkspacePatterns(projectRoot: string): Promise<string[]> {
  const workspaceFilePath = path.join(projectRoot, "pnpm-workspace.yaml");

  try {
    const content = await fsp.readFile(workspaceFilePath, "utf8");
    const lines = content.split("\n");

    const patterns: string[] = [];
    let inPackagesSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      if (trimmed === "packages:") {
        inPackagesSection = true;
        continue;
      }

      if (!inPackagesSection) {
        continue;
      }

      if (!trimmed.startsWith("-")) {
        inPackagesSection = false;
        continue;
      }

      const rawPattern = trimmed.replace(/^\-\s*/, "").trim();
      const normalized = rawPattern.replace(/^['"]|['"]$/g, "").trim();

      if (normalized) {
        patterns.push(normalized);
      }
    }

    return patterns;
  } catch {
    return [];
  }
}

async function collectPackageDirectories(projectRoot: string): Promise<string[]> {
  const directories: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fsp.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".turbo"
      ) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      const packageJsonPath = path.join(fullPath, "package.json");

      if (fs.existsSync(packageJsonPath)) {
        directories.push(fullPath);
      }

      await walk(fullPath);
    }
  }

  await walk(projectRoot);

  return directories;
}

function matchWorkspacePattern(relativePath: string, pattern: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);

  const matchSegments = (pathIdx: number, patternIdx: number): boolean => {
    if (patternIdx === patternSegments.length) {
      return pathIdx === pathSegments.length;
    }

    const currentPatternSegment = patternSegments[patternIdx];

    if (currentPatternSegment === "**") {
      for (let index = pathIdx; index <= pathSegments.length; index += 1) {
        if (matchSegments(index, patternIdx + 1)) {
          return true;
        }
      }
      return false;
    }

    if (pathIdx >= pathSegments.length) {
      return false;
    }

    if (currentPatternSegment === "*" || currentPatternSegment === pathSegments[pathIdx]) {
      return matchSegments(pathIdx + 1, patternIdx + 1);
    }

    return false;
  };

  return matchSegments(0, 0);
}

async function mapWorkspaceNamesToDirs(
  workspaceDirs: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const directory of workspaceDirs) {
    const packageJsonPath = path.join(directory, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = readRawPackageJson(packageJsonPath);
    if (packageJson.name) {
      result.set(packageJson.name, directory);
    }
  }

  return result;
}

async function resolveDependenciesRecursively({
  projectRoot,
  roots,
  workspaceNameToPath,
  workspaceRealPaths,
  production,
}: {
  projectRoot: string;
  roots: string[];
  workspaceNameToPath: Map<string, string>;
  workspaceRealPaths: Set<string>;
  production: boolean | undefined;
}): Promise<DependencyResolutionResult> {
  const queue = [...roots];
  const processed = new Set<string>();
  const dependencyPaths = new Set<string>();
  const unresolvedDependencies = new Map<string, Set<string>>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const realCurrent = toRealPathOrFallback(current);
    if (processed.has(realCurrent)) {
      continue;
    }
    processed.add(realCurrent);

    const packageJsonPath = path.join(current, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = readRawPackageJson(packageJsonPath);
    const dependenciesToResolve = collectDependencyNames(packageJson, production);
    const packageDisplayName = packageJson.name ?? path.basename(realCurrent);

    for (const dependency of dependenciesToResolve) {
      const dependencyName = dependency.name;
      const workspaceDirectory = workspaceNameToPath.get(dependencyName);
      if (workspaceDirectory) {
        queue.push(workspaceDirectory);
        continue;
      }

      const resolvedDependency = resolveDependencyPath({
        dependencyName,
        fromDirectory: current,
        projectRoot,
      });

      if (!resolvedDependency) {
        if (dependency.kind !== "optionalDependency") {
          if (!unresolvedDependencies.has(dependencyName)) {
            unresolvedDependencies.set(dependencyName, new Set<string>());
          }
          unresolvedDependencies.get(dependencyName)?.add(packageDisplayName);
        }
        continue;
      }

      const realDependencyPath = toRealPathOrFallback(resolvedDependency);

      if (!workspaceRealPaths.has(realDependencyPath)) {
        dependencyPaths.add(realDependencyPath);
      }

      if (!processed.has(realDependencyPath)) {
        queue.push(realDependencyPath);
      }
    }
  }

  const result: DependencyResolutionResult = {
    paths: [...dependencyPaths],
  };

  const warning = formatUnresolvedDependenciesWarning(unresolvedDependencies);
  if (warning) {
    result.warning = warning;
  }

  return result;
}

function collectDependencyNames(
  packageJson: RawPackageJson,
  production: boolean | undefined,
): CollectedDependency[] {
  const dependencyNames = new Map<string, DependencyKind>();

  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    dependencyNames.set(dependencyName, "dependency");
  }

  for (const dependencyName of Object.keys(packageJson.optionalDependencies ?? {})) {
    if (!dependencyNames.has(dependencyName)) {
      dependencyNames.set(dependencyName, "optionalDependency");
    }
  }

  if (!production) {
    for (const dependencyName of Object.keys(packageJson.devDependencies ?? {})) {
      if (!dependencyNames.has(dependencyName)) {
        dependencyNames.set(dependencyName, "devDependency");
      }
    }
  }

  return [...dependencyNames.entries()].map(([name, kind]) => ({
    name,
    kind,
  }));
}

function resolveDependencyPath({
  dependencyName,
  fromDirectory,
  projectRoot,
}: {
  dependencyName: string;
  fromDirectory: string;
  projectRoot: string;
}): string | null {
  const projectRootRealPath = toRealPathOrFallback(projectRoot);

  let currentDirectory = fromDirectory;

  while (true) {
    const candidatePackageJsonPath = path.join(
      currentDirectory,
      "node_modules",
      dependencyName,
      "package.json",
    );

    if (fs.existsSync(candidatePackageJsonPath)) {
      const packageDirectory = path.dirname(candidatePackageJsonPath);
      const realPackageDirectory = toRealPathOrFallback(packageDirectory);

      if (isPathWithin(realPackageDirectory, projectRootRealPath)) {
        return packageDirectory;
      }

      return null;
    }

    if (isSamePath(currentDirectory, projectRoot)) {
      break;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (isSamePath(parentDirectory, currentDirectory)) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  return null;
}

function isPathWithin(targetPath: string, parentPath: string): boolean {
  const normalizedParent = parentPath.endsWith(path.sep)
    ? parentPath
    : `${parentPath}${path.sep}`;

  return targetPath === parentPath || targetPath.startsWith(normalizedParent);
}

function isSamePath(leftPath: string, rightPath: string): boolean {
  try {
    const leftRealPath = fs.realpathSync(leftPath);
    const rightRealPath = fs.realpathSync(rightPath);
    return leftRealPath === rightRealPath;
  } catch {
    return path.resolve(leftPath) === path.resolve(rightPath);
  }
}

function readRawPackageJson(packageJsonPath: string): RawPackageJson {
  const rawContent = fs.readFileSync(packageJsonPath, "utf8");
  return JSON.parse(rawContent) as RawPackageJson;
}

function toRealPathOrFallback(directory: string): string {
  try {
    return fs.realpathSync(directory);
  } catch {
    return directory;
  }
}

function formatUnresolvedDependenciesWarning(
  unresolvedDependencies: Map<string, Set<string>>,
): string | undefined {
  if (unresolvedDependencies.size === 0) {
    return undefined;
  }

  const unresolvedEntries = [...unresolvedDependencies.entries()]
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([dependencyName, parents]) => {
      const parentNames = [...parents].sort((left, right) =>
        left.localeCompare(right),
      );
      return `${dependencyName} (required by ${parentNames.join(", ")})`;
    });

  return [
    `Some declared dependencies could not be resolved from node_modules (${unresolvedDependencies.size}):`,
    unresolvedEntries.join("; "),
    "Run your package manager install command and verify dependency names.",
  ].join(" ");
}
