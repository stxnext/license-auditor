import { spawn } from "node:child_process";
import { ExecCommandException } from "../exceptions/exec-command.exception.js";

export async function runCommand({
  command,
  args,
  cwd,
  timeoutMs = 15000,
}: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number | undefined;
}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new ExecCommandException(
          `Command timed out: ${command} ${args.join(" ")}`,
          {
            stdout: stdoutChunks.join(""),
            stderr: stderrChunks.join(""),
          },
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new ExecCommandException(
          `Failed to run command: ${command} ${args.join(" ")}`,
          {
            originalError: error,
            stdout: stdoutChunks.join(""),
            stderr: stderrChunks.join(""),
          },
        ),
      );
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);

      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");

      if (exitCode !== 0) {
        reject(
          new ExecCommandException(
            `Command failed (${exitCode}): ${command} ${args.join(" ")}`,
            {
              stdout,
              stderr,
            },
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}
