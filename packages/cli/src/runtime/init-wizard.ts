import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import { InvalidEnvironmentVariablesException } from "@brainhubeu/license-auditor-core";
import { ConfigExtension } from "../constants/config-constants.js";
import { envSchema } from "../env.js";
import { ConfigListType, generateConfig } from "../utils/generate-config.js";

export async function runInitWizard({ rootDir }: { rootDir: string }) {
  const parsedEnv = envSchema.safeParse({ ...process.env, ROOT_DIR: rootDir });

  if (!parsedEnv.success) {
    throw new InvalidEnvironmentVariablesException(
      "Failed to parse environment variables",
      {
        originalError: parsedEnv.error,
      },
    );
  }

  intro("License Auditor configuration wizard");

  const selectedExtension = await select<ConfigExtension>({
    message:
      "Which file extension would you like to use for your configuration file?",
    options: [
      { label: "TypeScript (.ts)", value: ConfigExtension.TS },
      { label: "JavaScript module (.mjs)", value: ConfigExtension.MJS },
      { label: "JavaScript (.js)", value: ConfigExtension.JS },
      { label: "JSON (.json)", value: ConfigExtension.JSON },
    ],
  });

  if (isCancel(selectedExtension)) {
    cancel("Configuration canceled.");
    process.exit(0);
  }

  const selectedListType = await select<ConfigListType>({
    message:
      "Would you like to use the default license whitelist and blacklist or configure your own?",
    options: [
      { label: "Use default lists", value: ConfigListType.Default },
      { label: "Use blank lists", value: ConfigListType.Blank },
      { label: "Use strict configuration lists", value: ConfigListType.Strict },
    ],
  });

  if (isCancel(selectedListType)) {
    cancel("Configuration canceled.");
    process.exit(0);
  }

  const s = spinner();
  s.start("Generating configuration file...");

  const resultMessage = await generateConfig(
    selectedListType,
    selectedExtension,
    parsedEnv.data.ROOT_DIR,
  );

  s.stop("Configuration generated.");
  outro(resultMessage);
}
