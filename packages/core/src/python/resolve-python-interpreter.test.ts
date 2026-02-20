import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePythonInterpreter } from "./resolve-python-interpreter.js";

const { runCommandMock } = vi.hoisted(() => ({
  runCommandMock: vi.fn(),
}));

vi.mock("./run-command.js", () => ({
  runCommand: runCommandMock,
}));

const tmpDirs: string[] = [];

beforeEach(() => {
  runCommandMock.mockReset();
});

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
  tmpDirs.length = 0;
});

describe("resolvePythonInterpreter", () => {
  it("uses CLI interpreter override first", async () => {
    const cwd = await createProject();
    const cliPythonPath = "/custom/python";

    runCommandMock.mockImplementation(async ({ command }: { command: string }) => {
      if (command === cliPythonPath) {
        return { stdout: "Python 3.12.0", stderr: "" };
      }
      throw new Error("not found");
    });

    const interpreter = await resolvePythonInterpreter({
      cwd,
      cliPythonPath,
    });

    expect(interpreter).toBe(cliPythonPath);
    expect(runCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        command: cliPythonPath,
        args: ["--version"],
      }),
    );
  });

  it("uses local .venv interpreter before python3/python", async () => {
    const cwd = await createProject();
    const venvInterpreter =
      process.platform === "win32"
        ? path.join(cwd, ".venv", "Scripts", "python.exe")
        : path.join(cwd, ".venv", "bin", "python");

    await fs.mkdir(path.dirname(venvInterpreter), { recursive: true });
    await fs.writeFile(venvInterpreter, "");

    runCommandMock.mockImplementation(async ({ command }: { command: string }) => {
      if (command === venvInterpreter) {
        return { stdout: "Python 3.11.9", stderr: "" };
      }
      throw new Error("not found");
    });

    const interpreter = await resolvePythonInterpreter({ cwd });

    expect(interpreter).toBe(venvInterpreter);
  });

  it("falls back to python3 when .venv is unavailable", async () => {
    const cwd = await createProject();

    runCommandMock.mockImplementation(async ({ command }: { command: string }) => {
      if (command === "python3") {
        return { stdout: "Python 3.10.0", stderr: "" };
      }
      throw new Error("not found");
    });

    const interpreter = await resolvePythonInterpreter({ cwd });

    expect(interpreter).toBe("python3");
  });

  it("falls back to python when python3 is unavailable", async () => {
    const cwd = await createProject();

    runCommandMock.mockImplementation(async ({ command }: { command: string }) => {
      if (command === "python") {
        return { stdout: "Python 3.9.0", stderr: "" };
      }
      throw new Error("not found");
    });

    const interpreter = await resolvePythonInterpreter({ cwd });

    expect(interpreter).toBe("python");
  });

  it("throws when no interpreter can be resolved", async () => {
    const cwd = await createProject();

    runCommandMock.mockRejectedValue(new Error("not found"));

    await expect(resolvePythonInterpreter({ cwd })).rejects.toThrowError(
      /Python interpreter was not found/,
    );
  });
});

async function createProject(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lac-python-interpreter-test-"));
  tmpDirs.push(directory);
  return directory;
}
