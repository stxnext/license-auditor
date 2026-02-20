import fs from "node:fs/promises";
import type { JsonResults, LicenseAuditResult } from "@license-auditor/data";

export async function saveResultToJson(
  result: LicenseAuditResult,
  jsonPath: string,
) {
  const parsedResult: JsonResults = {
    ...result.groupedByStatus,
    notFound: Array.from(result.notFound.entries()).map(
      ([packageName, value]) => ({
        packageName: value.packageName ?? packageName,
        ...value,
      }),
    ),
    needsUserVerification: Array.from(
      result.needsUserVerification.entries(),
    ).map(([packageName, value]) => ({
      packageName: value.packageName ?? packageName,
      ...value,
    })),
    errorResults: Array.from(result.errorResults.entries()).map(
      ([packageName, value]) => ({
        packageName: value.packageName ?? packageName,
        ...value,
      }),
    ),
  };
  await fs.writeFile(jsonPath, JSON.stringify(parsedResult, null, 2));
}
