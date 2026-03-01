import * as path from "node:path";

export function getCliPath() {
  return path.resolve(__dirname, "../../packages/cli/bin/lac.cjs");
}
