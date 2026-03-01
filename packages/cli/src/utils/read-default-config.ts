import type { ConfigType } from "@license-auditor/data";
import { getTemplateConfig } from "./config-template-data.js";

export async function readDefaultConfig(): Promise<{
  config: ConfigType;
  templateDir: string;
}> {
  return {
    config: getTemplateConfig("default"),
    templateDir: "built-in default template",
  };
}
