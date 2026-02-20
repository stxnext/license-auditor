import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

type PackageJsonResult =
  | { success: true; packageJson: PackageJsonType }
  | { success: false; errorMessage: string };

const packageLicenseObjectSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
});

const licenseFieldSchema = z.union([z.string(), packageLicenseObjectSchema]);

const licensesFieldSchema = z.union([
  z.array(z.string()),
  z.array(packageLicenseObjectSchema),
  z.string(),
]);

export const packageJsonSchema = z.union([
  z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    license: licenseFieldSchema.optional(),
    licenses: licensesFieldSchema.optional(),
  }),
  z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    license: licenseFieldSchema,
    licenses: z.any().transform(() => undefined),
  }),
  z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    license: z.any().transform(() => undefined),
    licenses: licensesFieldSchema,
  }),
]);

export type PackageJsonType = z.infer<typeof packageJsonSchema>;

export function readPackageJson(packagePath: string): PackageJsonResult {
  const packageJsonPath = path.join(packagePath, "package.json");

  if (fs.existsSync(packageJsonPath)) {
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const parsedPackageJson = JSON.parse(packageJsonContent);

    const validationResult = packageJsonSchema.safeParse(parsedPackageJson);

    if (validationResult.error) {
      return { errorMessage: validationResult.error.message, success: false };
    }

    if (validationResult.success) {
      return {
        packageJson: validationResult.data,
        success: true,
      };
    }
  }
  // unsure how often such case happens and whether the license verification should be skipped
  const errorMsg = `package.json not found for package at ${packagePath}`;
  return { errorMessage: errorMsg, success: false };
}

// reading package.json turned out to be inevitable since we want to include version in the key
export function extractPackageNameWithVersion(
  packageJson: PackageJsonType,
): string | undefined {
  if (packageJson?.name && packageJson?.version) {
    return `${packageJson.name}@${packageJson.version}`;
  }
  return undefined;
}

export function extractPackageNameFromPath(packagePath: string): string {
  const baseName = path.basename(packagePath);
  const parentName = path.basename(path.dirname(packagePath));

  if (parentName.startsWith("@") || parentName.includes("@")) {
    return `${parentName}/${baseName}`;
  }
  return baseName;
}
