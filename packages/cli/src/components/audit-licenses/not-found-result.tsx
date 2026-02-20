import type { LicenseAuditResult } from "@license-auditor/data";
import figures from "figures";
import { Box, Text } from "ink";

export default function NotFoundResult({
  notFound,
  verbose,
}: Omit<
  LicenseAuditResult,
  "needsUserVerification" | "groupedByStatus" | "overrides" | "errorResults"
> & {
  verbose: boolean;
}) {
  const describePackagesCount =
    notFound.size === 1 ? "package is" : "packages are";

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">{figures.warning}</Text>
        <Text>
          {notFound.size} {describePackagesCount} missing license information:
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {Array.from(notFound).map(
          ([packageKey, { packageName, packagePath, errorMessage }]) => (
            <Box key={packagePath} marginBottom={verbose ? 1 : 0}>
              <Text color="gray">{figures.pointerSmall}</Text>
              {verbose ? (
                <Text>
                  {" "}
                  {packageName ?? packageKey}: {errorMessage}
                </Text>
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
