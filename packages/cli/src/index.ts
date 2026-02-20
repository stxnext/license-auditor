export type OverrideSeverity = "warn" | "off";

export type ConfigType = {
  whitelist: string[];
  blacklist: string[];
  overrides?: Record<string, OverrideSeverity>;
};
