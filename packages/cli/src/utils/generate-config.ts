import fs from "node:fs/promises";
import path from "node:path";
import { GenerateConfigException } from "@brainhubeu/license-auditor-core";
import type { ConfigType } from "@license-auditor/data";
import { ConfigExtension } from "../constants/config-constants.js";
import { getTemplateConfig } from "./config-template-data.js";

export enum ConfigListType {
  Default = "default",
  Blank = "blank",
  Strict = "strict",
}

export function getConfigFileName(extension: ConfigExtension): string {
  return extension === ConfigExtension.JSON
    ? ".license-auditorrc.json"
    : `license-auditor.config${extension}`;
}

function renderConfig(config: ConfigType, extension: ConfigExtension): string {
  const serialized = JSON.stringify(config, null, 2);

  switch (extension) {
    case ConfigExtension.JSON:
      return `${serialized}\n`;
    case ConfigExtension.MJS:
    case ConfigExtension.JS:
      return `export default ${serialized};\n`;
    case ConfigExtension.TS:
      return [
        'import type { ConfigType } from "@brainhubeu/lac";',
        "",
        `const config: ConfigType = ${serialized};`,
        "",
        "export default config;",
        "",
      ].join("\n");
    default:
      return `${serialized}\n`;
  }
}

function getTemplateConfigForList(configListType: ConfigListType): ConfigType {
  switch (configListType) {
    case ConfigListType.Default:
      return getTemplateConfig("default");
    case ConfigListType.Strict:
      return getTemplateConfig("strict");
    case ConfigListType.Blank:
      return getTemplateConfig("blank");
    default:
      return getTemplateConfig("default");
  }
}

export async function generateConfig(
  configListType: ConfigListType,
  extension: ConfigExtension,
  dir: string,
) {
  try {
    await fs.mkdir(dir, { recursive: true });

    const config = getTemplateConfigForList(configListType);
    const fileName = getConfigFileName(extension);
    const destinationPath = path.join(dir, fileName);

    await fs.writeFile(destinationPath, renderConfig(config, extension), "utf8");

    return `Configured license-auditor with ${configListType} license whitelist and blacklist at: ${destinationPath}`;
  } catch (error) {
    throw new GenerateConfigException(
      "Failed to complete license configuration",
      {
        originalError: error,
      },
    );
  }
}
