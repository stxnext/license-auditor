import type {
  ConfigType,
  DependencyEcosystem,
  DependencyMetadataSource,
  DependencySource,
  DetectedLicense,
  Ecosystem,
} from "@license-auditor/data";
import { findDependencies } from "./dependency-finder/find-dependencies.js";
import {
  extractPackageNameFromPath,
  extractPackageNameWithVersion,
  readPackageJson,
} from "./file-utils.js";
import { resolveAuditEcosystem } from "./ecosystem/resolve-audit-ecosystem.js";
import { filterOverrides } from "./filter-overrides.js";
import { filterWithFilterRegex } from "./filter-with-filter-regex.js";
import { getPackageName } from "./get-package-name.js";
import { findLicenses } from "./license-finder/find-license.js";
import type { LicensesWithPathAndStatus } from "./license-finder/licenses-with-path.js";
import { collectPythonLicenses } from "./python/collect-python-licenses.js";

export type PackageLicensesWithPath = Map<
  string,
  {
    packagePath: string;
    packageName: string;
    licensesWithPath: LicensesWithPathAndStatus;
    ecosystem?: DependencyEcosystem | undefined;
    dependencySource?: DependencySource | undefined;
    metadataSource?: DependencyMetadataSource | undefined;
  }
>;

export type ErrorResults = Map<
  string,
  {
    packageName: string;
    packagePath: string;
    errorMessage: string;
    ecosystem?: DependencyEcosystem | undefined;
  }
>;

export type GetAllLicensesResult = {
  overrides: {
    notFoundOverrides: string[];
  };
  licenses: PackageLicensesWithPath;
  errorResults: ErrorResults;
  warning?: string | undefined;
};

type GetAllLicensesProps = {
  cwd: string;
  config: ConfigType;
  production?: boolean | undefined;
  filterRegex?: string | undefined;
  verbose?: boolean | undefined;
  ecosystem?: Ecosystem | undefined;
  python?: string | undefined;
  requirements?: string[] | undefined;
};

type CollectedLicenses = {
  licenses: PackageLicensesWithPath;
  errorResults: ErrorResults;
  warning?: string | undefined;
  foundPackageNames: Set<string>;
};

export async function getAllLicenses({
  cwd,
  config,
  production,
  filterRegex,
  verbose,
  ecosystem,
  python,
  requirements,
}: GetAllLicensesProps): Promise<GetAllLicensesResult> {
  const selectedEcosystem = resolveAuditEcosystem({
    cwd,
    cliEcosystem: ecosystem,
    configEcosystem: config.ecosystem,
  });

  const warnings: string[] = [];
  const licenses: PackageLicensesWithPath = new Map();
  const errorResults: ErrorResults = new Map();
  const foundPackageNames = new Set<string>();

  if (selectedEcosystem === "node" || selectedEcosystem === "both") {
    const nodeResult = await collectNodeLicenses({
      cwd,
      config,
      production,
      filterRegex,
      verbose,
    });

    mergeMaps(licenses, nodeResult.licenses);
    mergeMaps(errorResults, nodeResult.errorResults);
    mergeSets(foundPackageNames, nodeResult.foundPackageNames);
    if (nodeResult.warning) {
      warnings.push(nodeResult.warning);
    }
  }

  if (selectedEcosystem === "python" || selectedEcosystem === "both") {
    const pythonResult = await collectPythonLicenses({
      cwd,
      config,
      production,
      filterRegex,
      python,
      requirements,
    });

    mergeMaps(licenses, pythonResult.licenses);
    mergeMaps(errorResults, pythonResult.errorResults);
    mergeSets(foundPackageNames, pythonResult.foundPackageNames);
    if (pythonResult.warning) {
      warnings.push(pythonResult.warning);
    }
  }

  const notFoundOverrides = Object.keys(config.overrides ?? {}).filter(
    (packageName) => !foundPackageNames.has(packageName),
  );

  return {
    overrides: {
      notFoundOverrides,
    },
    licenses,
    warning: warnings.length > 0 ? warnings.join("\n") : undefined,
    errorResults,
  };
}

async function collectNodeLicenses({
  cwd,
  config,
  production,
  filterRegex,
  verbose,
}: {
  cwd: string;
  config: ConfigType;
  production?: boolean | undefined;
  filterRegex?: string | undefined;
  verbose?: boolean | undefined;
}): Promise<CollectedLicenses> {
  const { dependencies: packagePaths, warning } = await findDependencies({
    projectRoot: cwd,
    production,
    verbose,
  });

  const resultMap: PackageLicensesWithPath = new Map();
  const errorResults: ErrorResults = new Map();

  const foundPackages: Pick<DetectedLicense, "packageName" | "packagePath">[] =
    packagePaths.map((packagePath) => ({
      packagePath,
      packageName: extractPackageNameFromPath(packagePath),
    }));

  const filteredByRegex = filterWithFilterRegex({
    foundPackages,
    filterRegex,
  });

  const foundPackageNames = new Set(
    filteredByRegex.map((foundPackage) => getPackageName(foundPackage.packageName)),
  );

  const { filteredPackages } = filterOverrides({
    foundPackages: filteredByRegex,
    overrides: config.overrides,
  });

  for (const {
    packageName: packageNameFromPath,
    packagePath,
  } of filteredPackages) {
    const packageJsonResult = readPackageJson(packagePath);

    if (!packageJsonResult.success) {
      const packageKey = buildResultKey("node", packageNameFromPath);
      errorResults.set(packageKey, {
        packageName: packageNameFromPath,
        packagePath,
        errorMessage: packageJsonResult.errorMessage,
        ecosystem: "node",
      });
      continue;
    }

    const packageName =
      extractPackageNameWithVersion(packageJsonResult.packageJson) ??
      packageNameFromPath;

    const packageKey = buildResultKey("node", packageName);
    if (resultMap.has(packageKey)) {
      continue;
    }

    const licensesWithPath = await findLicenses(
      packageJsonResult.packageJson,
      packagePath,
    );

    resultMap.set(packageKey, {
      packagePath,
      packageName,
      licensesWithPath,
      ecosystem: "node",
      dependencySource: "node_modules",
      metadataSource: "local-metadata",
    });
  }

  return {
    licenses: resultMap,
    warning,
    errorResults,
    foundPackageNames,
  };
}

function buildResultKey(
  ecosystem: DependencyEcosystem,
  packageName: string,
): string {
  return `${ecosystem}:${packageName}`;
}

function mergeMaps<T>(target: Map<string, T>, source: Map<string, T>): void {
  for (const [key, value] of source.entries()) {
    if (!target.has(key)) {
      target.set(key, value);
    }
  }
}

function mergeSets(target: Set<string>, source: Set<string>): void {
  for (const value of source.values()) {
    target.add(value);
  }
}
