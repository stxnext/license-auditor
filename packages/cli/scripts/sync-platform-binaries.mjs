import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const cliPackageRoot = path.resolve(__dirname, "..");

const mappings = [
  {
    source: "lac-darwin-arm64",
    targetDir: "packages/lac-bin-darwin-arm64/bin",
    targetFile: "lac",
  },
  {
    source: "lac-darwin-x64",
    targetDir: "packages/lac-bin-darwin-x64/bin",
    targetFile: "lac",
  },
  {
    source: "lac-linux-arm64",
    targetDir: "packages/lac-bin-linux-arm64/bin",
    targetFile: "lac",
  },
  {
    source: "lac-linux-x64",
    targetDir: "packages/lac-bin-linux-x64/bin",
    targetFile: "lac",
  },
  {
    source: "lac-win32-x64.exe",
    targetDir: "packages/lac-bin-win32-arm64/bin",
    targetFile: "lac.exe",
  },
  {
    source: "lac-win32-x64.exe",
    targetDir: "packages/lac-bin-win32-x64/bin",
    targetFile: "lac.exe",
  },
];

for (const mapping of mappings) {
  const sourcePath = path.join(cliPackageRoot, "dist-binary", mapping.source);
  const targetPath = path.join(repoRoot, mapping.targetDir, mapping.targetFile);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);

  if (!targetPath.endsWith(".exe")) {
    await fs.chmod(targetPath, 0o755);
  }

  // Remove placeholders left in bin directories.
  const readmePath = path.join(path.dirname(targetPath), "README.md");
  try {
    await fs.unlink(readmePath);
  } catch {
    // noop
  }

  console.log(`Copied ${sourcePath} -> ${targetPath}`);
}
