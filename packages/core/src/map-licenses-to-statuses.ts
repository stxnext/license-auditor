import type {
  ConfigType,
  DetectedLicense,
  LicenseWithSource,
} from "@license-auditor/data";
import {
  type LicenseStatus,
  checkLicenseStatus,
} from "./check-license-status.js";
import type { PackageLicensesWithPath } from "./get-all-licenses.js";
import { parseVerificationStatusToMessage } from "./parse-verification-status-to-message.js";
import { resolveLicenseStatus } from "./resolve-license-status.js";

type NotFoundMap = Map<
  string,
  {
    packageName?: string;
    packagePath: string;
    errorMessage: string;
    ecosystem?: DetectedLicense["ecosystem"];
  }
>;
type NeedsUserVerificationMap = Map<
  string,
  {
    packageName?: string;
    packagePath: string;
    verificationMessage: string;
    ecosystem?: DetectedLicense["ecosystem"];
  }
>;
type GroupedByStatus = Record<LicenseStatus, DetectedLicense[]>;

export async function mapLicensesToStatus(
  packageLicensesWithPath: PackageLicensesWithPath,
  config: ConfigType,
): Promise<{
  groupedByStatus: GroupedByStatus;
  notFound: NotFoundMap;
  needsUserVerification: NeedsUserVerificationMap;
}> {
  const groupedByStatus: GroupedByStatus = {
    whitelist: [],
    blacklist: [],
    unknown: [],
  };

  const notFound: NotFoundMap = new Map();

  const needsUserVerification: NeedsUserVerificationMap = new Map();

  for (const {
    licensesWithPath,
    packageName,
    packagePath,
    ecosystem,
    dependencySource,
    metadataSource,
  } of packageLicensesWithPath.values()) {
    const {
      licenses,
      licensePath,
      licenseExpression,
      verificationStatus,
      manualVerificationMessage,
    } = licensesWithPath;
    const mapKey = buildResultMapKey(packageName, ecosystem);

    if (manualVerificationMessage) {
      needsUserVerification.set(mapKey, {
        packageName,
        packagePath,
        verificationMessage: manualVerificationMessage,
        ecosystem,
      });
      continue;
    }

    const hasPackageLicense = licenses.length > 0;

    if (!hasPackageLicense) {
      notFound.set(mapKey, {
        packageName,
        packagePath,
        errorMessage: `License not found in package.json and in license file in ${packagePath}`,
        ecosystem,
      });
      continue;
    }

    if (
      verificationStatus === "licenseFilesExistButSomeAreUncertain" ||
      verificationStatus === "licenseFileExistsButUnknownLicense"
    ) {
      needsUserVerification.set(mapKey, {
        packageName,
        packagePath,
        verificationMessage: parseVerificationStatusToMessage(
          verificationStatus,
          packageName,
          packagePath,
        ),
        ecosystem,
      });
      continue;
    }

    const areSomeButNotAllLicensesWhitelisted =
      someButNotAllLicensesWhitelisted(licenses, config);

    if (areSomeButNotAllLicensesWhitelisted) {
      needsUserVerification.set(mapKey, {
        packageName,
        packagePath,
        verificationMessage: parseVerificationStatusToMessage(
          "someButNotAllLicensesWhitelisted",
          packageName,
          packagePath,
        ),
        ecosystem,
      });

      // we don't "continue" here because we want this package to appear in the blacklisted results
    }

    const statusOfAllLicenses = resolveLicenseStatus(licensesWithPath, config);

    const detectedLicense: DetectedLicense = {
      packageName,
      packagePath,
      status: statusOfAllLicenses,
      licenses: licenses,
      licenseExpression: licenseExpression,
      licensePath: licensePath,
      verificationStatus: verificationStatus,
      ecosystem,
      dependencySource,
      metadataSource,
    };

    groupedByStatus[statusOfAllLicenses].push(detectedLicense);
  }

  return {
    groupedByStatus,
    notFound,
    needsUserVerification,
  };
}

function buildResultMapKey(
  packageName: string,
  ecosystem: DetectedLicense["ecosystem"],
): string {
  if (!ecosystem) {
    return packageName;
  }

  return `${ecosystem}:${packageName}`;
}

const someButNotAllLicensesWhitelisted = (
  licenses: LicenseWithSource[],
  config: ConfigType,
): boolean => {
  const whitelistedLicenses = licenses.filter((license) => {
    const licenseStatus = checkLicenseStatus(license, config);
    return licenseStatus === "whitelist";
  });

  return (
    !!whitelistedLicenses.length && whitelistedLicenses.length < licenses.length
  );
};
