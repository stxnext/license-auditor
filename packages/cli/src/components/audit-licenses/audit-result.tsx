import type {
  ConfigType,
  LicenseAuditResult,
  LicenseStatus,
} from "@license-auditor/data";
import { Box } from "ink";
import { OverrideResult } from "../override-result.js";
import ErrorBox from "./error-box.js";
import FailureResult from "./failure-result.js";
import IncludingUnknownResult from "./including-unknown-result.js";
import NeedsUserVerificationResult from "./needs-user-verification-result.js";
import NoLicensesFoundResult from "./no-licenses-found-result.js";
import NotFoundResult from "./not-found-result.js";
import ResultsList from "./results-list.js";
import SuccessResult from "./success-result.js";
import VerboseView from "./verbose-view.js";

function ResultForStatus({
  result,
  verbose,
}: { result: LicenseAuditResult; verbose: boolean }) {
  const hasWhitelisted = result.groupedByStatus.whitelist.length > 0;
  const hasBlacklisted = result.groupedByStatus.blacklist.length > 0;
  const hasUnknown = result.groupedByStatus.unknown.length > 0;

  switch (true) {
    case hasWhitelisted && !hasBlacklisted && !hasUnknown:
      return (
        <SuccessResult
          whitelistedCount={result.groupedByStatus.whitelist.length}
        />
      );

    case hasBlacklisted && !hasUnknown:
      return (
        <FailureResult
          groupedByStatus={result.groupedByStatus}
          verbose={verbose}
        />
      );

    case !(hasWhitelisted || hasBlacklisted || hasUnknown):
      return <NoLicensesFoundResult />;

    default:
      return (
        <IncludingUnknownResult
          groupedByStatus={result.groupedByStatus}
          verbose={verbose}
        />
      );
  }
}

interface AuditResultProps {
  result: LicenseAuditResult;
  overrides: Pick<ConfigType, "overrides">["overrides"];
  warning?: string | null;
  flags: {
    verbose: boolean;
    filter: LicenseStatus | undefined;
    bail: number | undefined;
  };
}

export default function AuditResult({
  result,
  overrides,
  warning,
  flags: { verbose, filter, bail },
}: AuditResultProps) {
  const hasNotFound = result.notFound.size > 0;
  const hasNeedsUserVerification = result.needsUserVerification.size > 0;
  const hasErrorResults = result.errorResults.size > 0;
  const blacklist = result.groupedByStatus.blacklist;

  const bailValue = bail ?? Number.POSITIVE_INFINITY;
  process.exitCode = blacklist.length > bailValue ? 1 : 0;

  return (
    <Box flexDirection="column">
      {verbose && <VerboseView result={result} filter={filter} />}
      <ResultForStatus result={result} verbose={verbose} />
      {hasNotFound && (
        <NotFoundResult notFound={result.notFound} verbose={verbose} />
      )}

      {warning && <ErrorBox color="yellow">{warning}</ErrorBox>}
      {verbose && (
        <OverrideResult
          configOverrides={overrides}
          resultOverrides={result.overrides}
        />
      )}
      {hasNeedsUserVerification && (
        <NeedsUserVerificationResult
          needsUserVerification={result.needsUserVerification}
          verbose={verbose}
        />
      )}
      {hasErrorResults && (
        <ResultsList
          message={["package returned error", "packages returned error"]}
          results={[...result.errorResults.entries()].map(
            ([packageKey, { packageName, errorMessage }]) => ({
              packageName: packageName ?? packageKey,
              message: errorMessage,
              licenses: [],
            }),
          )}
          type="error"
          renderMessages={verbose}
        />
      )}
    </Box>
  );
}
