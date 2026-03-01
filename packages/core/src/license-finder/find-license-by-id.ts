import { type License, licenseMap } from "@license-auditor/data";

export function findLicenseById(licenseId: unknown): License[] {
  if (typeof licenseId === "string") {
    const matchedLicense = [...licenseMap.values()].find(
      (license) => license.licenseId === licenseId,
    );

    if (matchedLicense) {
      return [
        {
          ...matchedLicense,
          seeAlso: [...matchedLicense.seeAlso],
        } as License,
      ];
    }
  }

  return [];
}
