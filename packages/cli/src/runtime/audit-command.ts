import { confirm, isCancel, spinner } from "@clack/prompts";
import { auditLicenses } from "@brainhubeu/license-auditor-core";
import { LicenseStatusSchema } from "@license-auditor/data";
import { readDefaultConfig } from "../utils/read-default-config.js";
import { readConfiguration } from "../utils/read-configuration.js";
import { saveResultToJson } from "../utils/save-result-to-json.js";
import { validateJsonPath } from "../utils/validate-json-path.js";
import { runInitWizard } from "./init-wizard.js";
import { printAuditOutput } from "./output.js";

export type RawCliOptions = {
  verbose?: boolean;
  strict?: boolean;
  filter?: string;
  json?: string | boolean;
  production?: boolean;
  defaultConfig?: boolean;
  filterRegex?: string;
  bail?: number;
};

export async function runAuditCommand({
  rootDir,
  options,
}: {
  rootDir: string;
  options: RawCliOptions;
}) {
  const filterResult = options.filter
    ? LicenseStatusSchema.safeParse(options.filter)
    : undefined;

  if (filterResult && !filterResult.success) {
    throw new Error(
      `Invalid filter value: ${options.filter}. Expected one of: whitelist, blacklist, unknown`,
    );
  }

  const { config, filepath } = await loadConfig({
    rootDir,
    useDefaultConfig: options.defaultConfig,
  });

  console.log(`Loaded configuration file: ${filepath}`);

  const auditSpinner = spinner();
  auditSpinner.start("Processing licenses...");

  const result = await auditLicenses({
    cwd: rootDir,
    config,
    production: options.production,
    filterRegex: options.filterRegex,
    verbose: options.verbose,
  });

  auditSpinner.stop("Finished processing licenses.");

  const jsonPath = await validateJsonPath(options.json);
  if (jsonPath) {
    await saveResultToJson(result, jsonPath);
    console.log(`Saved JSON output to ${jsonPath}`);
  }

  printAuditOutput(result, {
    verbose: Boolean(options.verbose),
    strict: Boolean(options.strict),
    production: Boolean(options.production),
    filter: filterResult?.success ? filterResult.data : undefined,
    bail: options.bail,
    warning: result.warning,
    overrides: config.overrides,
  });
}

async function loadConfig({
  rootDir,
  useDefaultConfig,
}: {
  rootDir: string;
  useDefaultConfig: boolean | undefined;
}) {
  if (useDefaultConfig) {
    const { config, templateDir } = await readDefaultConfig();

    return {
      config,
      filepath: templateDir,
    };
  }

  const loadedConfiguration = await readConfiguration(rootDir);

  if (!loadedConfiguration) {
    const shouldCreateConfig = await confirm({
      message: "Configuration file not found. Would you like to create one now?",
      initialValue: true,
    });

    if (isCancel(shouldCreateConfig) || !shouldCreateConfig) {
      throw new Error("Configuration file not found");
    }

    await runInitWizard({ rootDir });

    const reloadedConfiguration = await readConfiguration(rootDir);

    if (!reloadedConfiguration) {
      throw new Error("Configuration file was not created successfully");
    }

    return reloadedConfiguration;
  }

  return loadedConfiguration;
}
