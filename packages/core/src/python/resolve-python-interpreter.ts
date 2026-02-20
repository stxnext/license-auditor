import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./run-command.js";

export async function resolvePythonInterpreter({
  cwd,
  cliPythonPath,
}: {
  cwd: string;
  cliPythonPath?: string | undefined;
}): Promise<string> {
  const candidates: string[] = [];

  if (cliPythonPath) {
    candidates.push(cliPythonPath);
  }

  const localVenvCandidate =
    process.platform === "win32"
      ? path.join(cwd, ".venv", "Scripts", "python.exe")
      : path.join(cwd, ".venv", "bin", "python");

  if (fs.existsSync(localVenvCandidate)) {
    candidates.push(localVenvCandidate);
  }

  candidates.push("python3", "python");

  for (const candidate of candidates) {
    try {
      await runCommand({
        command: candidate,
        args: ["--version"],
        cwd,
        timeoutMs: 8000,
      });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    [
      "Python interpreter was not found.",
      "Provide --python <path> or install python3/python.",
    ].join(" "),
  );
}
