import type { LicenseAuditResult } from "@license-auditor/data";
import figures from "figures";
import { Box, Text } from "ink";
import { pluralize } from "../../utils/pluralize.js";

export default function NeedsUserVerificationResult({
  needsUserVerification,
  verbose,
}: Omit<
  LicenseAuditResult,
  "notFound" | "groupedByStatus" | "overrides" | "errorResults"
> & {
  verbose: boolean;
}) {
  const describePackagesCount = pluralize(
    needsUserVerification.size,
    "package is",
    "packages are",
  );

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">{figures.warning}</Text>
        <Text>{describePackagesCount} requiring manual checking:</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {Array.from(needsUserVerification).map(
          ([packageKey, { packageName, verificationMessage }]) => (
            <Box key={packageKey} marginBottom={verbose ? 1 : 0}>
              <Text color="gray">{figures.pointerSmall}</Text>
              {verbose ? (
                <Text> {verificationMessage} </Text>
              ) : (
                <Text> {packageName ?? packageKey} </Text>
              )}
            </Box>
          ),
        )}
      </Box>
    </Box>
  );
}
