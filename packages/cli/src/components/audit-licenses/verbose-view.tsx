import type { LicenseAuditResult, LicenseStatus } from "@license-auditor/data";
import { Text } from "ink";
import { useMemo } from "react";
import { type Column, Table } from "../table.js";

function getColorForStatus(status: LicenseStatus | "not found") {
  switch (status) {
    case "whitelist":
      return "green";
    case "blacklist":
      return "red";
    case "not found":
      return "cyan";
    default:
      return "yellow";
  }
}

interface VerboseViewProps {
  result: LicenseAuditResult;
  filter: LicenseStatus | undefined;
}

interface VerboseViewData extends Record<string, string> {
  status: LicenseStatus | "not found";
  packageName: string;
  license: string;
  deprecated: string;
}

const columns: Column<VerboseViewData>[] = [
  {
    title: "status",
    accessor: "status",
    cell: (content) => (
      <Text color={getColorForStatus(content as LicenseStatus)}>{content}</Text>
    ),
  },
  {
    title: "package name",
    accessor: "packageName",
  },
  {
    title: "license",
    accessor: "license",
  },
  {
    title: "deprecated",
    accessor: "deprecated",
  },
] as const;

export default function VerboseView({ result, filter }: VerboseViewProps) {
  const data = useMemo(() => {
    let combinedResult: VerboseViewData[] = [
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
                self.findIndex((l) => l.licenseId === license.licenseId) ===
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

    const notFoundEntries = Array.from(result.notFound.entries()).map(
      ([packageKey, value]) => ({
        status: "not found" as const,
        packageName: value.packageName ?? packageKey,
        license: "-",
        deprecated: "-",
      }),
    );

    combinedResult = [...combinedResult, ...notFoundEntries];

    if (filter) {
      combinedResult = combinedResult.filter(
        (license) => license.status === filter,
      );
    }

    return combinedResult;
  }, [result, filter]);

  return <Table<VerboseViewData> columns={columns} data={data} />;
}
