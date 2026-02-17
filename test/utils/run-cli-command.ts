import path from "node:path";
import { spawn } from "node:child_process";

export type CliCommand = {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export async function runCliCommand(command: CliCommand) {
  return new Promise<{ output: string; errorCode: number }>((resolve, reject) => {
    const normalized = normalizeCommand(command);

    const child = spawn(normalized.command, normalized.args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ...command.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output: string[] = [];

    child.stdout.on("data", (data) => {
      output.push(data.toString());
    });

    child.stderr.on("data", (data) => {
      output.push(data.toString());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        output: output.join(""),
        errorCode: code ?? 1,
      });
    });
  });
}

function normalizeCommand(command: CliCommand): CliCommand {
  if (
    command.command === "npx" &&
    command.args.length > 0 &&
    path.isAbsolute(command.args[0] ?? "")
  ) {
    return {
      ...command,
      command: process.execPath,
      args: command.args,
    };
  }

  return command;
}
