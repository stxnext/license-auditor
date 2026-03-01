import type {
  ConfigType,
  Ecosystem,
  LicenseAuditResult,
} from "@license-auditor/data";
import { getAllLicenses } from "./get-all-licenses.js";
import { mapLicensesToStatus } from "./map-licenses-to-statuses.js";

interface AuditLicensesProps {
  cwd: string;
  config: ConfigType;
  filterRegex?: string | undefined;
  production?: boolean | undefined;
  verbose?: boolean | undefined;
  ecosystem?: Ecosystem | undefined;
  python?: string | undefined;
  requirements?: string[] | undefined;
}

export async function auditLicenses({
  cwd,
  config,
  filterRegex,
  production,
  verbose,
  ecosystem,
  python,
  requirements,
}: AuditLicensesProps): Promise<LicenseAuditResult> {
  const { licenses, overrides, warning, errorResults } = await getAllLicenses({
    cwd,
    config,
    production,
    filterRegex,
    verbose,
    ecosystem,
    python,
    requirements,
  });

  const { groupedByStatus, notFound, needsUserVerification } =
    await mapLicensesToStatus(licenses, config);

  return {
    groupedByStatus,
    notFound,
    overrides,
    warning,
    needsUserVerification,
    errorResults,
  };
}
