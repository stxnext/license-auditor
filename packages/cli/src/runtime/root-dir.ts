import { InvalidEnvironmentVariablesException } from "@brainhubeu/license-auditor-core";
import { envSchema } from "../env.js";

export function resolveRootDirectory() {
  const parsedEnv = envSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new InvalidEnvironmentVariablesException(
      "Failed to parse environment variables",
      {
        originalError: parsedEnv.error,
      },
    );
  }

  return parsedEnv.data.ROOT_DIR;
}
