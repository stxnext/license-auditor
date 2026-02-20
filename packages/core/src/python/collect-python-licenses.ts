import fs from "node:fs";
import path from "node:path";
import type { ConfigType } from "@license-auditor/data";
import { LICENSE_SOURCE } from "@license-auditor/data";
import { filterOverrides } from "../filter-overrides.js";
import { filterWithFilterRegex } from "../filter-with-filter-regex.js";
import { getPackageName } from "../get-package-name.js";
import type {
  ErrorResults,
  PackageLicensesWithPath,
} from "../get-all-licenses.js";
import { discoverRequirementsFiles, normalizePythonPackageName, parseRequirementsFiles, type ParsedRequirement } from "./requirements.js";
import { parseUvExportRequirements } from "./parse-uv-export-requirements.js";
import { fetchPypiProjectMetadata } from "./pypi-client.js";
import { resolvePythonInterpreter } from "./resolve-python-interpreter.js";
import { resolvePythonLicenses, type PythonMetadataInput } from "./resolve-python-licenses.js";
import { runCommand } from "./run-command.js";

type CollectedLicenses = {
  licenses: PackageLicensesWithPath;
  errorResults: ErrorResults;
  warning?: string | undefined;
  foundPackageNames: Set<string>;
};

type PythonDependencyCandidate = {
  packageName: string;
  packagePath: string;
  normalizedName: string;
  version: string;
  dependencySource: "python-environment" | "uv-lock" | "requirements";
  metadata: PythonMetadataInput;
  explicitLicensePaths?: string[] | undefined;
  metadataSource: "local-metadata" | "pypi-json-api";
  metadataAvailable: boolean;
};

type PythonEnvironmentDistribution = {
  name?: string | undefined;
  normalizedName?: string | undefined;
  normalized_name?: string | undefined;
  version?: string | undefined;
  packagePath?: string | undefined;
  package_path?: string | undefined;
  licenseExpression?: string | undefined;
  license_expression?: string | undefined;
  license?: string | undefined;
  classifiers?: string[] | undefined;
  licensePaths?: string[] | undefined;
  license_paths?: string[] | undefined;
};

export async function collectPythonLicenses({
  cwd,
  config,
  production,
  filterRegex,
  python,
  requirements,
}: {
  cwd: string;
  config: ConfigType;
  production?: boolean | undefined;
  filterRegex?: string | undefined;
  python?: string | undefined;
  requirements?: string[] | undefined;
}): Promise<CollectedLicenses> {
  const warnings: string[] = [];
  const licenses: PackageLicensesWithPath = new Map();
  const errorResults: ErrorResults = new Map();
  const foundPackageNames = new Set<string>();

  const hasUvLock = fs.existsSync(path.join(cwd, "uv.lock"));
  const requirementsFiles =
    requirements && requirements.length > 0
      ? requirements.map((file) =>
          path.isAbsolute(file) ? file : path.resolve(cwd, file),
        )
      : await discoverRequirementsFiles(cwd);

  const pinnedDependencies = new Map<string, ParsedRequirement & {
    dependencySource: "uv-lock" | "requirements";
  }>();

  if (hasUvLock) {
    const uvResult = await collectDependenciesFromUvLock({
      cwd,
      production,
    });

    warnings.push(...uvResult.warnings);

    for (const dependency of uvResult.dependencies) {
      const key = `${dependency.normalizedName}@${dependency.version}`;
      if (!pinnedDependencies.has(key)) {
        pinnedDependencies.set(key, {
          ...dependency,
          dependencySource: "uv-lock",
        });
      }
    }
  }

  if (requirementsFiles.length > 0) {
    const requirementsResult = await parseRequirementsFiles({
      cwd,
      files: requirementsFiles,
    });

    warnings.push(...requirementsResult.warnings);

    for (const requirement of requirementsResult.requirements) {
      const key = `${requirement.normalizedName}@${requirement.version}`;
      if (!pinnedDependencies.has(key)) {
        pinnedDependencies.set(key, {
          ...requirement,
          dependencySource: "requirements",
        });
      }
    }

    for (const unsupportedRequirement of requirementsResult.unsupportedRequirements) {
      const baseName =
        unsupportedRequirement.packageName ??
        `unresolved-requirement-${normalizePythonPackageName(unsupportedRequirement.rawLine.slice(0, 24))}`;
      const packageName = `${baseName}@unknown`;
      const candidate = {
        packageName,
        packagePath: unsupportedRequirement.sourceFile,
      };

      const filteredByRegex = filterWithFilterRegex({
        foundPackages: [candidate],
        filterRegex,
      });

      if (filteredByRegex.length === 0) {
        continue;
      }

      const { filteredPackages } = filterOverrides({
        foundPackages: filteredByRegex,
        overrides: config.overrides,
      });

      if (filteredPackages.length === 0) {
        continue;
      }

      foundPackageNames.add(getPackageName(candidate.packageName));

      const key = buildResultKey(candidate.packageName);
      licenses.set(key, {
        packageName: candidate.packageName,
        packagePath: candidate.packagePath,
        licensesWithPath: {
          licenses: [],
          licensePath: [candidate.packagePath],
          verificationStatus: "licenseFileNotFound",
          manualVerificationMessage: [
            `Requirement entry needs manual verification for ${candidate.packageName}.`,
            `Unsupported requirement specification: ${unsupportedRequirement.rawLine}`,
          ].join(" "),
        },
        ecosystem: "python",
        dependencySource: "requirements",
        metadataSource: "pypi-json-api",
      });
    }
  }

  if (production && (!hasUvLock || requirementsFiles.length > 0)) {
    warnings.push(
      "Python --production mode is best-effort. Precise dev dependency exclusion is guaranteed only for uv.lock export mode.",
    );
  }

  if (pinnedDependencies.size === 0) {
    const environmentCandidates = await collectDependenciesFromEnvironment({
      cwd,
      python,
    });

    const foundPackages = environmentCandidates.map((candidate) => ({
      packageName: candidate.packageName,
      packagePath: candidate.packagePath,
    }));

    const filteredByRegex = filterWithFilterRegex({
      foundPackages,
      filterRegex,
    });

    for (const foundPackage of filteredByRegex) {
      foundPackageNames.add(getPackageName(foundPackage.packageName));
    }

    const { filteredPackages } = filterOverrides({
      foundPackages: filteredByRegex,
      overrides: config.overrides,
    });

    const allowedPackageNames = new Set(
      filteredPackages.map((foundPackage) => foundPackage.packageName),
    );

    for (const candidate of environmentCandidates) {
      if (!allowedPackageNames.has(candidate.packageName)) {
        continue;
      }

      try {
        const resolved = await resolvePythonLicenses({
          packagePath: candidate.packagePath,
          metadata: candidate.metadata,
          explicitLicensePaths: candidate.explicitLicensePaths,
        });

        licenses.set(buildResultKey(candidate.packageName), {
          packageName: candidate.packageName,
          packagePath: candidate.packagePath,
          licensesWithPath: resolved.licensesWithPath,
          ecosystem: "python",
          dependencySource: candidate.dependencySource,
          metadataSource: resolved.metadataSource,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown Python resolution error";

        errorResults.set(buildResultKey(candidate.packageName), {
          packageName: candidate.packageName,
          packagePath: candidate.packagePath,
          errorMessage,
          ecosystem: "python",
        });
      }
    }
  } else {
    const dependencyCandidates = await enrichDependenciesFromPypi({
      dependencies: [...pinnedDependencies.values()],
      warnings,
    });

    const foundPackages = dependencyCandidates.map((candidate) => ({
      packageName: candidate.packageName,
      packagePath: candidate.packagePath,
    }));

    const filteredByRegex = filterWithFilterRegex({
      foundPackages,
      filterRegex,
    });

    for (const foundPackage of filteredByRegex) {
      foundPackageNames.add(getPackageName(foundPackage.packageName));
    }

    const { filteredPackages } = filterOverrides({
      foundPackages: filteredByRegex,
      overrides: config.overrides,
    });

    const allowedPackageNames = new Set(
      filteredPackages.map((foundPackage) => foundPackage.packageName),
    );

    for (const candidate of dependencyCandidates) {
      if (!allowedPackageNames.has(candidate.packageName)) {
        continue;
      }

      if (!candidate.metadataAvailable) {
        licenses.set(buildResultKey(candidate.packageName), {
          packageName: candidate.packageName,
          packagePath: candidate.packagePath,
          licensesWithPath: {
            licenses: [],
            licensePath: [candidate.packagePath],
            verificationStatus: "licenseFileNotFound",
            manualVerificationMessage: [
              `Manual verification required for ${candidate.packageName}.`,
              "PyPI metadata could not be resolved from lockfile/requirements sources.",
            ].join(" "),
          },
          ecosystem: "python",
          dependencySource: candidate.dependencySource,
          metadataSource: candidate.metadataSource,
        });
        continue;
      }

      try {
        const resolved = await resolvePythonLicenses({
          packagePath: candidate.packagePath,
          metadata: candidate.metadata,
          explicitLicensePaths: [],
        });

        const normalizedLicensesWithPath =
          candidate.metadataSource === "pypi-json-api"
            ? {
                ...resolved.licensesWithPath,
                licenses: resolved.licensesWithPath.licenses.map((license) => ({
                  ...license,
                  source: LICENSE_SOURCE.pythonPypiMetadata,
                })),
                ...(candidate.metadata.licenseExpression
                  ? {
                      licenseExpression: candidate.metadata.licenseExpression,
                    }
                  : {}),
              }
            : resolved.licensesWithPath;

        licenses.set(buildResultKey(candidate.packageName), {
          packageName: candidate.packageName,
          packagePath: candidate.packagePath,
          licensesWithPath: normalizedLicensesWithPath,
          ecosystem: "python",
          dependencySource: candidate.dependencySource,
          metadataSource: candidate.metadataSource,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown Python resolution error";

        errorResults.set(buildResultKey(candidate.packageName), {
          packageName: candidate.packageName,
          packagePath: candidate.packagePath,
          errorMessage,
          ecosystem: "python",
        });
      }
    }
  }

  return {
    licenses,
    errorResults,
    warning: warnings.length > 0 ? warnings.join("\n") : undefined,
    foundPackageNames,
  };
}

async function collectDependenciesFromEnvironment({
  cwd,
  python,
}: {
  cwd: string;
  python?: string | undefined;
}): Promise<PythonDependencyCandidate[]> {
  const pythonInterpreter = await resolvePythonInterpreter({
    cwd,
    cliPythonPath: python,
  });

  const script = [
    "import json",
    "import importlib.metadata as metadata",
    "records = []",
    "for dist in metadata.distributions():",
    "    meta = dist.metadata",
    "    name = meta.get('Name') or meta.get('name')",
    "    version = getattr(dist, 'version', None) or meta.get('Version')",
    "    if not name or not version:",
    "        continue",
    "    classifiers = meta.get_all('Classifier') or []",
    "    license_paths = []",
    "    try:",
    "        for file_item in dist.files or []:",
    "            file_name = str(file_item).lower()",
    "            if 'license' in file_name or 'copying' in file_name or file_name.endswith('notice'):",
    "                try:",
    "                    license_paths.append(str(dist.locate_file(file_item)))",
    "                except Exception:",
    "                    pass",
    "    except Exception:",
    "        pass",
    "    try:",
    "        package_path = str(dist.locate_file(''))",
    "    except Exception:",
    "        package_path = ''",
    "    records.append({",
    "        'name': name,",
    "        'normalizedName': name.lower().replace('_', '-').replace('.', '-'),",
    "        'version': version,",
    "        'packagePath': package_path,",
    "        'licenseExpression': meta.get('License-Expression'),",
    "        'license': meta.get('License'),",
    "        'classifiers': classifiers,",
    "        'licensePaths': license_paths,",
    "    })",
    "print(json.dumps(records))",
  ].join("\n");

  const { stdout } = await runCommand({
    command: pythonInterpreter,
    args: ["-c", script],
    cwd,
    timeoutMs: 30000,
  });

  const parsed = JSON.parse(stdout) as PythonEnvironmentDistribution[];

  return parsed.flatMap((distribution) => {
    const name = distribution.name;
    const version = distribution.version;

    if (!name || !version) {
      return [];
    }

    const normalizedName =
      distribution.normalizedName ??
      distribution.normalized_name ??
      normalizePythonPackageName(name);
    const packagePath =
      distribution.packagePath ??
      distribution.package_path ??
      `${normalizedName}@${version}`;
    const licenseExpression =
      distribution.licenseExpression ??
      distribution.license_expression;
    const licensePaths =
      distribution.licensePaths ??
      distribution.license_paths;

    return [
      {
        packageName: `${name}@${version}`,
        packagePath,
        normalizedName,
        version,
        dependencySource: "python-environment" as const,
        metadata: {
          licenseExpression,
          license: distribution.license,
          classifiers: Array.isArray(distribution.classifiers)
            ? distribution.classifiers
            : [],
        },
        explicitLicensePaths: Array.isArray(licensePaths) ? licensePaths : [],
        metadataSource: "local-metadata" as const,
        metadataAvailable: true,
      },
    ];
  });
}

async function collectDependenciesFromUvLock({
  cwd,
  production,
}: {
  cwd: string;
  production?: boolean | undefined;
}): Promise<{
  dependencies: ParsedRequirement[];
  warnings: string[];
}> {
  const args = ["export", "--frozen", "--format", "requirements.txt"];

  if (production) {
    args.push("--no-dev");
  }

  try {
    const { stdout } = await runCommand({
      command: "uv",
      args,
      cwd,
      timeoutMs: 30000,
    });

    return parseUvExportRequirements({
      output: stdout,
      cwd,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run uv export for uv.lock";

    return {
      dependencies: [],
      warnings: [
        [
          "uv.lock detected but uv export failed.",
          message,
          "Install uv or pass --requirements / --python to select another source.",
        ].join(" "),
      ],
    };
  }
}

async function enrichDependenciesFromPypi({
  dependencies,
  warnings,
}: {
  dependencies: Array<
    ParsedRequirement & { dependencySource: "uv-lock" | "requirements" }
  >;
  warnings: string[];
}): Promise<PythonDependencyCandidate[]> {
  const resolved = await mapWithConcurrency(dependencies, 8, async (dependency) => {
    const metadata = await fetchPypiProjectMetadata({
      name: dependency.normalizedName,
      version: dependency.version,
    });

    if (!metadata) {
      warnings.push(
        [
          `Unable to resolve PyPI metadata for ${dependency.name}==${dependency.version}.`,
          `Source: ${dependency.sourceFile}.`,
        ].join(" "),
      );

      return {
        packageName: `${dependency.name}@${dependency.version}`,
        packagePath: dependency.sourceFile,
        normalizedName: dependency.normalizedName,
        version: dependency.version,
        dependencySource: dependency.dependencySource,
        metadata: {
          classifiers: [],
        },
        metadataSource: "pypi-json-api",
        explicitLicensePaths: [],
        metadataAvailable: false,
      } satisfies PythonDependencyCandidate;
    }

    return {
      packageName: `${metadata.name}@${metadata.version}`,
      packagePath: dependency.sourceFile,
      normalizedName: dependency.normalizedName,
      version: dependency.version,
      dependencySource: dependency.dependencySource,
      metadata: {
        licenseExpression: metadata.licenseExpression,
        license: metadata.license,
        classifiers: metadata.classifiers,
      },
      metadataSource: "pypi-json-api",
      explicitLicensePaths: [],
      metadataAvailable: true,
    } satisfies PythonDependencyCandidate;
  });

  return resolved;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      results[currentIndex] = await mapper(items[currentIndex] as T);
    }
  });

  await Promise.all(workers);

  return results;
}

function buildResultKey(packageName: string): string {
  return `python:${packageName}`;
}
