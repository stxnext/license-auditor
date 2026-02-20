import {
  LICENSE_SOURCE,
  type LicenseWithSource,
  type VerificationStatus,
} from "@license-auditor/data";
import { addLicenseSource } from "../license-finder/add-license-source.js";
import { extractLicensesFromExpression } from "../license-finder/extract-licenses-from-expression.js";
import { findLicenseById } from "../license-finder/find-license-by-id.js";
import { findLicenseInLicenseFile } from "../license-finder/find-license-in-license-file.js";
import { parseLicenseFiles } from "../license-finder/find-license-in-license-file.js";
import { parseLicenseLogicalExpression } from "../license-finder/parse-license-logical-expression.js";
import type { LicensesWithPathAndStatus } from "../license-finder/licenses-with-path.js";

export type PythonMetadataInput = {
  licenseExpression?: string | undefined;
  license?: string | undefined;
  classifiers: string[];
};

const CLASSIFIER_TO_SPDX: Record<string, string[]> = {
  "license :: osi approved :: mit license": ["MIT"],
  "license :: osi approved :: apache software license": ["Apache-2.0"],
  "license :: osi approved :: bsd license": ["BSD-3-Clause", "BSD-2-Clause"],
  "license :: osi approved :: gnu general public license (gpl)": [
    "GPL-3.0-only",
    "GPL-2.0-only",
  ],
  "license :: osi approved :: gnu lesser general public license v3 (lgplv3)": [
    "LGPL-3.0-only",
  ],
  "license :: osi approved :: gnu lesser general public license v2 (lgplv2)": [
    "LGPL-2.1-only",
    "LGPL-2.0-only",
  ],
  "license :: osi approved :: isc license": ["ISC"],
  "license :: osi approved :: mozilla public license 2.0 (mpl 2.0)": [
    "MPL-2.0",
  ],
  "license :: osi approved :: python software foundation license": ["PSF-2.0"],
};

export async function resolvePythonLicenses({
  packagePath,
  metadata,
  explicitLicensePaths,
}: {
  packagePath: string;
  metadata: PythonMetadataInput;
  explicitLicensePaths?: string[] | undefined;
}): Promise<{
  licensesWithPath: LicensesWithPathAndStatus;
  metadataSource: "local-metadata" | "pypi-json-api" | "license-file";
}> {
  const metadataLicenses = collectLicensesFromMetadata(metadata);

  const fileLicenses =
    explicitLicensePaths
      ? await parseSpecificLicenseFiles(explicitLicensePaths, packagePath)
      : await parseLicenseFiles(packagePath);

  const mergedLicenses = dedupeLicenses([
    ...metadataLicenses.licenses,
    ...fileLicenses.licenses,
  ]);

  const licensePath = dedupeStringArray([
    ...metadataLicenses.licensePath,
    ...fileLicenses.licensePath,
  ]);

  const metadataSource =
    mergedLicenses.length > 0 && fileLicenses.licenses.length === mergedLicenses.length
      ? "license-file"
      : "local-metadata";

  return {
    licensesWithPath: {
      licenses: mergedLicenses,
      licensePath,
      verificationStatus: fileLicenses.verificationStatus,
      ...(metadataLicenses.licenseExpression
        ? {
            licenseExpression: metadataLicenses.licenseExpression,
            licenseExpressionParsed: metadataLicenses.licenseExpressionParsed,
          }
        : {}),
    },
    metadataSource,
  };
}

function collectLicensesFromMetadata(metadata: PythonMetadataInput): {
  licenses: LicenseWithSource[];
  licensePath: string[];
  licenseExpression?: string;
  licenseExpressionParsed?: ReturnType<typeof parseLicenseLogicalExpression>;
} {
  const licenses: LicenseWithSource[] = [];
  let parsedExpression: ReturnType<typeof parseLicenseLogicalExpression>;
  let expressionValue: string | undefined;

  if (metadata.licenseExpression) {
    const expression = parseLicenseLogicalExpression(metadata.licenseExpression);
    if (expression) {
      parsedExpression = expression;
      expressionValue = metadata.licenseExpression;
      licenses.push(
        ...extractLicensesFromExpression(expression).map((license) => ({
          ...license,
          source: LICENSE_SOURCE.pythonMetadataLicenseExpression,
        })),
      );
    }
  }

  if (metadata.license) {
    const directLicenses = findLicenseById(metadata.license);

    if (directLicenses.length > 0) {
      licenses.push(
        ...addLicenseSource(
          directLicenses,
          LICENSE_SOURCE.pythonMetadataLicenseField,
        ),
      );
    } else {
      const expression = parseLicenseLogicalExpression(metadata.license);
      if (expression) {
        if (!parsedExpression) {
          parsedExpression = expression;
          expressionValue = metadata.license;
        }

        licenses.push(
          ...extractLicensesFromExpression(expression).map((license) => ({
            ...license,
            source: LICENSE_SOURCE.pythonMetadataLicenseField,
          })),
        );
      }
    }
  }

  for (const classifier of metadata.classifiers) {
    if (!classifier.toLowerCase().startsWith("license ::")) {
      continue;
    }

    const classifierLicenses = resolveLicensesFromClassifier(classifier);
    licenses.push(...classifierLicenses);
  }

  return {
    licenses: dedupeLicenses(licenses),
    licensePath: [],
    ...(parsedExpression && expressionValue
      ? {
          licenseExpression: expressionValue,
          licenseExpressionParsed: parsedExpression,
        }
      : {}),
  };
}

function resolveLicensesFromClassifier(classifier: string): LicenseWithSource[] {
  const normalized = classifier.trim().toLowerCase();

  const mappedLicenses =
    CLASSIFIER_TO_SPDX[normalized]?.flatMap((licenseId) =>
      findLicenseById(licenseId),
    ) ?? [];

  if (mappedLicenses.length > 0) {
    return addLicenseSource(
      mappedLicenses,
      LICENSE_SOURCE.pythonMetadataClassifierMapped,
    );
  }

  const classifierParts = classifier.split("::").map((part) => part.trim());
  const fromId = classifierParts.flatMap((part) => findLicenseById(part));

  if (fromId.length > 0) {
    return addLicenseSource(fromId, LICENSE_SOURCE.pythonMetadataClassifier);
  }

  return [];
}

async function parseSpecificLicenseFiles(
  licensePaths: string[],
  packagePath: string,
): Promise<LicensesWithPathAndStatus> {
  const foundLicenses: LicenseWithSource[] = [];
  let uncertainFiles = 0;

  for (const licensePath of licensePaths) {
    const result = await findLicenseInLicenseFile(licensePath);

    if (result.licenses.length === 0) {
      uncertainFiles += 1;
      continue;
    }

    if (
      result.licenses.some(
        (license) => license.source === LICENSE_SOURCE.licenseFileContextKeywords,
      )
    ) {
      uncertainFiles += 1;
    }

    foundLicenses.push(...result.licenses);
  }

  if (licensePaths.length === 0) {
    return {
      licenses: [],
      licensePath: [packagePath],
      verificationStatus: "licenseFileNotFound",
    };
  }

  if (foundLicenses.length === 0) {
    return {
      licenses: [],
      licensePath: licensePaths,
      verificationStatus: "licenseFileExistsButUnknownLicense",
    };
  }

  return {
    licenses: dedupeLicenses(foundLicenses),
    licensePath: licensePaths,
    verificationStatus: getVerificationStatus(uncertainFiles),
  };
}

function getVerificationStatus(uncertainFiles: number): VerificationStatus {
  if (uncertainFiles > 0) {
    return "licenseFilesExistButSomeAreUncertain";
  }

  return "ok";
}

function dedupeLicenses(licenses: LicenseWithSource[]): LicenseWithSource[] {
  const deduped = new Map<string, LicenseWithSource>();

  for (const license of licenses) {
    const key = `${license.licenseId}:${license.source}`;
    if (!deduped.has(key)) {
      deduped.set(key, license);
    }
  }

  return [...deduped.values()];
}

function dedupeStringArray(values: string[]): string[] {
  return [...new Set(values)];
}
