import { LicenseStatusSchema } from "@license-auditor/data";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { z } from "zod";
import AuditLicenses from "../components/audit-licenses/audit-licenses.js";
import { ConfigErrorHandler } from "../components/config-error-handler.js";
import { JSON_RESULT_FILE_NAME } from "../constants/options-constants.js";
import { useReadConfiguration } from "../hooks/use-read-config-file.js";
import { useValidateJsonPath } from "../hooks/use-validate-json-path.js";

export const options = z.object({
  verbose: z.boolean().default(false).describe("Verbose output"),
  filter: LicenseStatusSchema.optional().describe(
    "Filter by license status - whitelist, blacklist, or unknown",
  ),
  json: z
    .union([z.string(), z.boolean()])
    .optional()
    .describe(
      `Save the result to a JSON file. If no path is not provided, a file named ${JSON_RESULT_FILE_NAME} will be created in the current directory.`,
    ),
  production: z
    .boolean()
    .describe(`Don't check licenses in development dependencies`),
  defaultConfig: z // pacsalCase options are converted to kebab-case, so the flag is actually --default-config
    .boolean()
    .describe("Run audit with default whitelist/blacklist configuration"),
  filterRegex: z
    .string()
    .optional()
    .describe(
      "Filter packages by a regex pattern for example: --filter-regex babel",
    ),
  bail: z
    .number()
    .optional()
    .describe(
      "Flag is used to control the exit behavior of the CI process based on the number of blacklisted licenses. By default it is set to Infinity",
    ),
  ecosystem: z
    .enum(["auto", "node", "python", "both"])
    .optional()
    .describe("Select ecosystem to audit: auto, node, python, or both"),
  python: z
    .string()
    .optional()
    .describe("Override Python interpreter path for Python ecosystem audit"),
  requirements: z
    .array(z.string())
    .optional()
    .describe("Provide one or multiple requirements files"),
});

export type Options = {
  options: z.infer<typeof options>;
};

export default function Index({ options }: Options) {
  const { configFile, error } = useReadConfiguration({
    useDefaults: options.defaultConfig,
  });
  const validateJsonResult = useValidateJsonPath(options.json);

  if (error) {
    return <ConfigErrorHandler error={error} />;
  }

  if (configFile?.config && validateJsonResult.validated) {
    return (
      <Box flexDirection="column">
        <Text>Loaded configuration file: {configFile.filepath}</Text>
        <AuditLicenses
          config={configFile.config}
          json={validateJsonResult.path}
          flags={options}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Spinner />
      <Text>Reading configuration...</Text>
    </Box>
  );
}
