#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PLATFORM_BINARIES = {
  "darwin-arm64": {
    packageName: "@brainhubeu/lac-bin-darwin-arm64",
    relativeBinaryPath: "bin/lac",
  },
  "darwin-x64": {
    packageName: "@brainhubeu/lac-bin-darwin-x64",
    relativeBinaryPath: "bin/lac",
  },
  "linux-arm64": {
    packageName: "@brainhubeu/lac-bin-linux-arm64",
    relativeBinaryPath: "bin/lac",
  },
  "linux-x64": {
    packageName: "@brainhubeu/lac-bin-linux-x64",
    relativeBinaryPath: "bin/lac",
  },
  "win32-arm64": {
    packageName: "@brainhubeu/lac-bin-win32-arm64",
    relativeBinaryPath: "bin/lac.exe",
  },
  "win32-x64": {
    packageName: "@brainhubeu/lac-bin-win32-x64",
    relativeBinaryPath: "bin/lac.exe",
  },
};

const platformKey = `${process.platform}-${process.arch}`;
const platformConfig = PLATFORM_BINARIES[platformKey];

if (!platformConfig) {
  console.error(
    `Unsupported platform "${platformKey}". Supported platforms: ${Object.keys(PLATFORM_BINARIES).join(", ")}`,
  );
  process.exit(1);
}

let packageRoot;
try {
  const packageJsonPath = require.resolve(
    `${platformConfig.packageName}/package.json`,
  );
  packageRoot = path.dirname(packageJsonPath);
} catch {
  packageRoot = null;
}

let binaryPath =
  packageRoot === null
    ? null
    : path.join(packageRoot, platformConfig.relativeBinaryPath);

if (!binaryPath || !fs.existsSync(binaryPath)) {
  const localSourcePath = path.resolve(__dirname, "../src/cli.ts");

  if (fs.existsSync(localSourcePath)) {
    runAndExit("bun", [localSourcePath, ...process.argv.slice(2)]);
  }

  const localBinaryPath = path.resolve(
    __dirname,
    "../dist-binary",
    process.platform === "win32" ? "lac.exe" : "lac",
  );

  if (fs.existsSync(localBinaryPath)) {
    binaryPath = localBinaryPath;
  } else {
    console.error(
      [
        `Missing platform binary package: ${platformConfig.packageName}.`,
        "Try reinstalling @brainhubeu/lac and ensure optional dependencies are enabled.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

runAndExit(binaryPath, process.argv.slice(2));

function runAndExit(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}
