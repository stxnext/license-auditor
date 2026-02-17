#!/usr/bin/env bun
import { Command } from "commander";
import { runAuditCommand } from "./runtime/audit-command.js";
import { runInitWizard } from "./runtime/init-wizard.js";
import { resolveRootDirectory } from "./runtime/root-dir.js";

const program = new Command();

program
  .name("lac")
  .description("License Auditor CLI")
  .version("3.0.0", "-v, --version", "Show version number")
  .option("--verbose", "Verbose output", false)
  .option(
    "--strict",
    "Treat dependency resolution warnings as failures (exit code 1)",
    false,
  )
  .option(
    "--filter <filter>",
    "Filter by license status - whitelist, blacklist, or unknown",
  )
  .option(
    "--json [path]",
    "Save the result to a JSON file. If no path is provided, a file named license-auditor.results.json will be created in the current directory.",
  )
  .option("--production", "Don't check licenses in development dependencies")
  .option(
    "--default-config",
    "Run audit with default whitelist/blacklist configuration",
  )
  .option(
    "--filter-regex <pattern>",
    "Filter packages by a regex pattern for example: --filter-regex babel",
  )
  .option(
    "--bail <number>",
    "Flag controls process exit status if blacklisted license count exceeds the provided threshold.",
    parseIntegerOption,
  )
  .action(async (options) => {
    await runAuditCommand({
      rootDir: resolveRootDirectory(),
      options,
    });
  });

program
  .command("init")
  .description("Generate license-auditor configuration file")
  .action(async () => {
    await runInitWizard({
      rootDir: resolveRootDirectory(),
    });
  });

program.showHelpAfterError();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("An unknown error occurred");
  }

  process.exitCode = 1;
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
}
