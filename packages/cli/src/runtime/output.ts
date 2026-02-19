import type {
  ConfigType,
  DetectedLicense,
  LicenseAuditResult,
  LicenseStatus,
  LicenseWithSource,
} from "@license-auditor/data";
import pc from "picocolors";
import { pluralize } from "../utils/pluralize.js";

type OutputOptions = {
  verbose: boolean;
  strict: boolean;
  production: boolean;
  filter: LicenseStatus | undefined;
  bail: number | undefined;
  warning?: string | undefined;
  overrides: Pick<ConfigType, "overrides">["overrides"];
};

const ICONS = {
  success: pc.green("✓"),
  warning: pc.yellow("⚠"),
  error: pc.red("✖"),
  item: pc.gray("›"),
};

export function printAuditOutput(
  result: LicenseAuditResult,
  { verbose, strict, production, filter, bail, warning, overrides }: OutputOptions,
): void {
  const hasWhitelisted = result.groupedByStatus.whitelist.length > 0;
  const hasBlacklisted = result.groupedByStatus.blacklist.length > 0;
  const hasUnknown = result.groupedByStatus.unknown.length > 0;

  const bailValue = bail ?? Number.POSITIVE_INFINITY;
  const hasStrictWarning = strict && Boolean(warning);
  process.exitCode =
    result.groupedByStatus.blacklist.length > bailValue || hasStrictWarning
      ? 1
      : 0;

  if (verbose) {
    printVerboseView(result, filter);
  }

  if (hasWhitelisted && !hasBlacklisted && !hasUnknown) {
    printHeader("success");
    console.log(
      `${ICONS.success} ${pluralize(result.groupedByStatus.whitelist.length, "license is", "licenses are")} compliant`,
    );
  } else if (hasBlacklisted && !hasUnknown) {
    printHeader("failure");

    if (hasWhitelisted) {
      console.log(
        `${ICONS.success} ${pluralize(result.groupedByStatus.whitelist.length, "license is", "licenses are")} compliant`,
      );
    }

    console.log(
      `${ICONS.error} ${pluralize(result.groupedByStatus.blacklist.length, "license is", "licenses are")} blacklisted:`,
    );
    printDetectedLicenseList(result.groupedByStatus.blacklist, verbose);
  } else if (!(hasWhitelisted || hasBlacklisted || hasUnknown)) {
    printHeader("warning");
    if (production) {
      console.log(
        `${ICONS.warning} No licenses found in production dependencies. If your project uses only devDependencies, this is expected.`,
      );
    } else {
      console.log(
        `${ICONS.warning} No licenses found. If this is unexpected, please check your configuration file.`,
      );
    }
  } else {
    printHeader(hasBlacklisted ? "failure" : "warning");

    if (hasWhitelisted) {
      console.log(
        `${ICONS.success} ${pluralize(result.groupedByStatus.whitelist.length, "license is", "licenses are")} compliant`,
      );
    }

    if (hasBlacklisted) {
      console.log(
        `${ICONS.error} ${pluralize(result.groupedByStatus.blacklist.length, "license is", "licenses are")} blacklisted:`,
      );
      printDetectedLicenseList(result.groupedByStatus.blacklist, verbose);
    }

    console.log(
      `${ICONS.warning} ${pluralize(result.groupedByStatus.unknown.length, "license is", "licenses are")} unknown:`,
    );
    printDetectedLicenseList(result.groupedByStatus.unknown, verbose);
  }

  if (result.notFound.size > 0) {
    console.log(
      `${ICONS.warning} ${result.notFound.size} ${pluralize(result.notFound.size, "package is", "packages are")} missing license information:`,
    );

    for (const [packageName, notFoundResult] of result.notFound.entries()) {
      if (verbose) {
        console.log(`${ICONS.item} ${packageName}: ${notFoundResult.errorMessage}`);
      } else {
        console.log(`${ICONS.item} ${packageName}`);
      }
    }
  }

  if (result.needsUserVerification.size > 0) {
    console.log(
      `${ICONS.warning} ${pluralize(result.needsUserVerification.size, "package is", "packages are")} requiring manual checking:`,
    );

    for (const [packageName, verificationResult] of result.needsUserVerification.entries()) {
      if (verbose) {
        console.log(`${ICONS.item} ${verificationResult.verificationMessage}`);
      } else {
        console.log(`${ICONS.item} ${packageName}`);
      }
    }
  }

  if (warning) {
    console.log(`${ICONS.warning} ${warning}`);

    if (hasStrictWarning) {
      console.log(
        `${ICONS.error} Strict mode enabled: dependency resolution warnings are treated as failures.`,
      );
    }
  }

  if (verbose) {
    printOverrideSummary(overrides, result.overrides);
  }

  if (result.errorResults.size > 0) {
    console.log(
      `${ICONS.error} ${pluralize(result.errorResults.size, "package returned error", "packages returned error")}:`,
    );

    for (const [packageName, errorResult] of result.errorResults.entries()) {
      if (verbose) {
        console.log(`${ICONS.item} ${errorResult.errorMessage}`);
      } else {
        console.log(`${ICONS.item} ${packageName}`);
      }
    }
  }

  if (!verbose) {
    console.log("\nuse --verbose flag for more details and paths included in output");
  }
}

function printDetectedLicenseList(
  detectedLicenses: DetectedLicense[],
  verbose: boolean,
): void {
  for (const license of detectedLicenses) {
    if (!verbose) {
      console.log(`${ICONS.item} ${license.packageName}`);
      continue;
    }

    const licenses = license.licenses
      .map((licenseItem) => stringifyLicense(licenseItem))
      .join(", ");

    const message = [
      license.packageName,
      licenses ? `licenses: ${licenses}` : undefined,
      license.verificationStatus
        ? `verification: ${license.verificationStatus}`
        : undefined,
      license.licensePath.length > 0
        ? `sources: ${license.licensePath.join(", ")}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" | ");

    console.log(`${ICONS.item} ${message}`);
  }
}

function stringifyLicense(license: LicenseWithSource): string {
  const deprecatedSuffix = license.isDeprecatedLicenseId ? " (deprecated)" : "";
  return `${license.licenseId}${deprecatedSuffix}`;
}

function printHeader(type: "success" | "failure" | "warning"): void {
  const message =
    type === "success"
      ? `${ICONS.success} LICENSE AUDIT SUCCEEDED`
      : type === "failure"
        ? `${ICONS.error} LICENSE AUDIT FAILED`
        : `${ICONS.warning} LICENSE AUDIT WARNING`;

  const styledMessage =
    type === "success"
      ? pc.bgGreen(pc.black(` ${message} `))
      : type === "failure"
        ? pc.bgRed(pc.white(` ${message} `))
        : pc.bgYellow(pc.black(` ${message} `));

  console.log(styledMessage);
}

function printOverrideSummary(
  configOverrides: Pick<ConfigType, "overrides">["overrides"],
  resultOverrides: Pick<LicenseAuditResult, "overrides">["overrides"],
): void {
  if (!configOverrides || Object.keys(configOverrides).length === 0) {
    return;
  }

  const overrideCount = Object.keys(configOverrides).length;
  console.log(
    `${ICONS.warning} Skipped audit for ${pluralize(overrideCount, "license", "licenses")} defined in the config file overrides field.`,
  );

  const warnOverrides = Object.entries(configOverrides)
    .filter(([, severity]) => severity === "warn")
    .map(([packageName]) => packageName);

  if (warnOverrides.length > 0) {
    console.log(`${ICONS.warning} Packages skipped with a warning:`);

    for (const packageName of warnOverrides) {
      console.log(`${ICONS.item} ${packageName}`);
    }
  }

  if (resultOverrides.notFoundOverrides.length > 0) {
    console.log(`${ICONS.warning} Packages listed in the overrides field but not found:`);

    for (const packageName of resultOverrides.notFoundOverrides) {
      console.log(`${ICONS.item} ${packageName}`);
    }
  }
}

function printVerboseView(
  result: LicenseAuditResult,
  filter: LicenseStatus | undefined,
): void {
  const rows: Array<{
    status: LicenseStatus | "not found";
    packageName: string;
    license: string;
    deprecated: string;
  }> = [
    ...result.groupedByStatus.whitelist,
    ...result.groupedByStatus.blacklist,
    ...result.groupedByStatus.unknown,
  ].map((detectedLicense) => ({
    status: detectedLicense.status,
    packageName: detectedLicense.packageName,
    license: detectedLicense.licenseExpression
      ? detectedLicense.licenseExpression
      : detectedLicense.licenses
          .filter(
            (license, index, self) =>
              self.findIndex((item) => item.licenseId === license.licenseId) ===
              index,
          )
          .map((license) => license.licenseId)
          .join(", "),
    deprecated: detectedLicense.licenses.some(
      (license) => license.isDeprecatedLicenseId,
    )
      ? "Yes"
      : "No",
  }));

  const notFoundRows = Array.from(result.notFound.entries()).map(
    ([packageName]) => ({
      status: "not found" as const,
      packageName,
      license: "-",
      deprecated: "-",
    }),
  );

  const combinedRows = [...rows, ...notFoundRows].filter((row) => {
    if (!filter) {
      return true;
    }

    return row.status === filter;
  });

  if (combinedRows.length === 0) {
    console.log("verbose output: no matching entries");
    return;
  }

  console.log("\nstatus | package name | license | deprecated");
  console.log("------ | ------------ | ------- | ----------");

  for (const row of combinedRows) {
    console.log(`${row.status} | ${row.packageName} | ${row.license} | ${row.deprecated}`);
  }

  console.log("");
}
