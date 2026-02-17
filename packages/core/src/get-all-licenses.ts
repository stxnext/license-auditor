import type { ConfigType, DetectedLicense } from "@license-auditor/data";
import { findDependencies } from "./dependency-finder/find-dependencies.js";
import {
  extractPackageNameFromPath,
  extractPackageNameWithVersion,
  readPackageJson,
} from "./file-utils.js";
import { filterOverrides } from "./filter-overrides.js";
import { filterWithFilterRegex } from "./filter-with-filter-regex.js";
import { findLicenses } from "./license-finder/find-license.js";
import type { LicensesWithPathAndStatus } from "./license-finder/licenses-with-path.js";

export type PackageLicensesWithPath = Map<
  string,
  {
    packagePath: string;
    packageName: string;
    licensesWithPath: LicensesWithPathAndStatus;
  }
>;

type ErrorResults = Map<string, { packagePath: string; errorMessage: string }>;

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
};

export async function getAllLicenses({
  cwd,
  config,
  production,
  filterRegex,
  verbose,
}: GetAllLicensesProps): Promise<GetAllLicensesResult> {
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

  const { filteredPackages, notFoundOverrides } = filterOverrides({
    foundPackages: filteredByRegex,
    overrides: config.overrides,
  });

  for (const {
    packageName: packageNameFromPath,
    packagePath,
  } of filteredPackages) {
    const packageJsonResult = readPackageJson(packagePath);

    if (!packageJsonResult.success) {
      errorResults.set(packageNameFromPath, {
        packagePath,
        errorMessage: packageJsonResult.errorMessage,
      });
      continue;
    }

    const packageName =
      extractPackageNameWithVersion(packageJsonResult.packageJson) ??
      packageNameFromPath;
    if (resultMap.has(packageName)) {
      continue;
    }

    const licensesWithPath = await findLicenses(
      packageJsonResult.packageJson,
      packagePath,
    );

    const packageWithLicense = {
      packagePath,
      packageName,
      licensesWithPath,
    };

    resultMap.set(packageName, packageWithLicense);
  }

  return {
    overrides: {
      notFoundOverrides,
    },
    licenses: resultMap,
    warning,
    errorResults,
  };
}
