import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { ValidateJsonPathException } from "@brainhubeu/license-auditor-core";
import { JSON_RESULT_FILE_NAME } from "../constants/options-constants.js";

export async function validateJsonPath(
  json: string | boolean | undefined,
): Promise<string | undefined> {
  if (!json) {
    return undefined;
  }

  const jsonPath =
    typeof json === "string"
      ? path.resolve(process.cwd(), json)
      : path.resolve(process.cwd(), JSON_RESULT_FILE_NAME);

  const parentDirPath = path.dirname(jsonPath);

  const statParentInfo = await statPath(parentDirPath);
  if (!statParentInfo) {
    throw new ValidateJsonPathException(`Path ${parentDirPath} does not exist`);
  }

  const statPathInfo = await statPath(jsonPath);

  if (statPathInfo?.isDirectory()) {
    console.warn(
      `The provided path is a directory, a file with the name ${JSON_RESULT_FILE_NAME} will be created in the directory.`,
    );

    return path.join(jsonPath, JSON_RESULT_FILE_NAME);
  }

  return jsonPath;
}

async function statPath(pathToCheck: string) {
  try {
    return await fs.stat(pathToCheck);
  } catch {
    return null;
  }
}
