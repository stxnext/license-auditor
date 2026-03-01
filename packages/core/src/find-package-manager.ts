import fs from "node:fs";
import path from "node:path";
import { UnsupportedPackageManagerException } from "./exceptions/unsupported-package-manager.exception.js";

export type SupportedPm =
  | "bun"
  | "npm"
  | "pnpm"
  | "yarn"
  | "yarn-classic"
  | "unknown";

type RootPackageJson = {
  packageManager?: string;
};

export async function findPackageManager(cwd: string): Promise<SupportedPm> {
  if (fs.existsSync(path.join(cwd, ".pnp.cjs"))) {
    throw new UnsupportedPackageManagerException(
      "Yarn Plug'n'Play is currently not supported.",
    );
  }

  if (
    fs.existsSync(path.join(cwd, "bun.lock")) ||
    fs.existsSync(path.join(cwd, "bun.lockb"))
  ) {
    return "bun";
  }

  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    const packageManager = readPackageManagerField(cwd);

    if (packageManager?.startsWith("yarn@1.")) {
      return "yarn-classic";
    }

    return "yarn";
  }

  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    return "npm";
  }

  const packageManager = readPackageManagerField(cwd);

  if (packageManager?.startsWith("bun@")) {
    return "bun";
  }

  if (packageManager?.startsWith("pnpm@")) {
    return "pnpm";
  }

  if (packageManager?.startsWith("yarn@1.")) {
    return "yarn-classic";
  }

  if (packageManager?.startsWith("yarn@")) {
    return "yarn";
  }

  if (packageManager?.startsWith("npm@")) {
    return "npm";
  }

  return "unknown";
}

function readPackageManagerField(cwd: string): string | undefined {
  try {
    const packageJsonPath = path.join(cwd, "package.json");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent) as RootPackageJson;
    return packageJson.packageManager;
  } catch {
    return undefined;
  }
}
