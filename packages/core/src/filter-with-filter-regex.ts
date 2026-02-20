import type { DetectedLicense } from "@license-auditor/data";
import { getPackageName } from "./get-package-name.js";

export function filterWithFilterRegex({
  foundPackages,
  filterRegex,
}: {
  foundPackages: Pick<DetectedLicense, "packageName" | "packagePath">[];
  filterRegex?: string | undefined;
}): {
  packageName: string;
  packagePath: string;
}[] {
  if (!filterRegex) {
    return foundPackages;
  }

  const regex = new RegExp(filterRegex);

  const filteredPackages = foundPackages.filter(
    (foundPackage) =>
      !regex.test(getPackageName(foundPackage.packageName)) &&
      !regex.test(foundPackage.packageName),
  );

  return filteredPackages;
}
