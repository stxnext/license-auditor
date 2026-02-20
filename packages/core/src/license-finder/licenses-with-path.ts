import type { DetectedLicense, LicenseWithSource } from "@license-auditor/data";
import type { Info } from "spdx-expression-parse";

export type LicensesWithPath = Pick<DetectedLicense, "licensePath"> &
  ResolvedLicenses;

export type LicensesWithPathAndStatus = Pick<
  DetectedLicense,
  "licensePath" | "verificationStatus"
> &
  ResolvedLicenses & {
    manualVerificationMessage?: string | undefined;
  };

export type ResolvedLicenses = {
  licenses: LicenseWithSource[];
  licenseExpression?: string | undefined;
  licenseExpressionParsed?: Info | undefined;
};
