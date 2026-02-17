import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ConfigSchema, type ConfigType } from "@license-auditor/data";

export const CONFIG_FILE_NAMES = [
  "license-auditor.config.ts",
  "license-auditor.config.js",
  "license-auditor.config.mjs",
  "license-auditor.config.cjs",
  "license-auditor.config.json",
  "license-auditor.config.yaml",
  "license-auditor.config.yml",
  ".license-auditorrc.json",
] as const;

export async function readConfiguration(rootDir: string): Promise<{
  filepath: string;
  config: ConfigType;
} | null> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(rootDir, fileName);

    try {
      await fs.access(filePath);
    } catch {
      continue;
    }

    const loadedConfig = await loadConfigFile(filePath);

    return {
      filepath: filePath,
      config: loadedConfig,
    };
  }

  return null;
}

async function loadConfigFile(filePath: string): Promise<ConfigType> {
  const extension = path.extname(filePath).toLowerCase();
  const parsedValue = await parseConfigByExtension(filePath, extension);

  const normalizedValue = removeSchemaProperty(parsedValue);
  const parsedConfig = ConfigSchema.safeParse(normalizedValue);

  if (!parsedConfig.success) {
    const firstIssue = parsedConfig.error.issues[0];
    const issueMessage = firstIssue
      ? formatConfigIssue(firstIssue)
      : "Invalid configuration structure";

    throw new Error(`Invalid configuration file at ${filePath}: ${issueMessage}`);
  }

  return parsedConfig.data;
}

async function parseConfigByExtension(
  filePath: string,
  extension: string,
): Promise<unknown> {
  let parsedValue: unknown;

  try {
    switch (extension) {
      case ".json":
        parsedValue = JSON.parse(await fs.readFile(filePath, "utf8"));
        break;
      case ".yaml":
      case ".yml": {
        parsedValue = parseYaml(await fs.readFile(filePath, "utf8"));
        break;
      }
      case ".cjs": {
        const require = createRequire(import.meta.url);
        const requiredModule = require(filePath) as { default?: unknown };
        parsedValue = requiredModule.default ?? requiredModule;
        break;
      }
      case ".ts":
      case ".js":
      case ".mjs": {
        const loadedModule = (await import(pathToFileURL(filePath).href)) as {
          default?: unknown;
        };
        parsedValue = loadedModule.default ?? loadedModule;
        break;
      }
      default:
        throw new Error(`Unsupported config extension: ${extension}`);
    }
  } catch (error) {
    throw new Error(
      `Invalid configuration file at ${filePath}: ${getErrorMessage(error)}`,
    );
  }

  return parsedValue;
}

function removeSchemaProperty(configValue: unknown): unknown {
  if (!configValue || typeof configValue !== "object") {
    return configValue;
  }

  const { $schema: _schema, ...rest } = configValue as Record<string, unknown>;
  return rest;
}

function parseYaml(yamlContent: string): unknown {
  const bun = (globalThis as { Bun?: { YAML?: { parse: (value: string) => unknown } } })
    .Bun;

  if (!bun?.YAML) {
    throw new Error(
      "YAML configuration files are supported only in Bun runtime.",
    );
  }

  return bun.YAML.parse(yamlContent);
}

function formatConfigIssue(issue: {
  code: string;
  message: string;
  path: Array<string | number>;
}): string {
  const location = issue.path.length > 0 ? issue.path.join(".") : "root";

  if (issue.code === "invalid_union") {
    return `${location} contains an unsupported SPDX license identifier`;
  }

  return `${location}: ${issue.message}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown parsing error";
}
