import type { ConfigType, LicenseStatus } from "@license-auditor/data";
import { checkLicenseStatus } from "./check-license-status.js";
import { evaluateLicenseExpression } from "./evaluate-license-expression.js";
import type { LicensesWithPath } from "./license-finder/licenses-with-path.js";

export function resolveLicenseStatus(
  licensesWithPath: LicensesWithPath,
  config: ConfigType,
): LicenseStatus {
  const { licenses, licenseExpression, licenseExpressionParsed } =
    licensesWithPath;

  if (licenseExpression && licenseExpressionParsed) {
    return evaluateLicenseExpression(licenseExpressionParsed, config);
  }

  return licenses.reduce<LicenseStatus>((currentStatus, license) => {
    const licenseStatus = checkLicenseStatus(license, config);
    if (licenseStatus === "blacklist") {
      return "blacklist";
    }
    if (licenseStatus === "unknown" && currentStatus !== "blacklist") {
      return "unknown";
    }
    return currentStatus;
  }, "whitelist");
}
