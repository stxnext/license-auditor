import { ConfigSchema, type ConfigType } from "@license-auditor/data";
import blankTemplateRaw from "../../public/template/blank/.license-auditorrc.json";
import defaultTemplateRaw from "../../public/template/default/.license-auditorrc.json";
import strictTemplateRaw from "../../public/template/strict/.license-auditorrc.json";

const RAW_TEMPLATE_CONFIGS = {
  blank: blankTemplateRaw,
  default: defaultTemplateRaw,
  strict: strictTemplateRaw,
} as const;

function normalizeTemplate(rawTemplate: unknown): ConfigType {
  if (!rawTemplate || typeof rawTemplate !== "object") {
    throw new Error("Invalid template format");
  }

  const { $schema: _schema, ...rest } = rawTemplate as Record<string, unknown>;

  const normalized = {
    ...rest,
    blacklist: Array.isArray(rest.blacklist)
      ? rest.blacklist.filter(
          (license): license is string =>
            typeof license === "string" && license.trim().length > 0,
        )
      : rest.blacklist,
    whitelist: Array.isArray(rest.whitelist)
      ? rest.whitelist.filter(
          (license): license is string =>
            typeof license === "string" && license.trim().length > 0,
        )
      : rest.whitelist,
  };

  return ConfigSchema.parse(normalized);
}

export function getTemplateConfig(
  templateName: keyof typeof RAW_TEMPLATE_CONFIGS,
): ConfigType {
  return normalizeTemplate(RAW_TEMPLATE_CONFIGS[templateName]);
}
