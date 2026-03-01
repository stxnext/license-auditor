#!/usr/bin/env bash
set -euo pipefail

USE_LINUX_UPX_RUNTIME="${USE_LINUX_UPX_RUNTIME:-false}"

ensure_runtime_in_cache() {
  local target="$1"
  local runtime_path="$2"

  if [[ -f "$runtime_path" ]]; then
    return 0
  fi

  local warmup_file="./packages/cli/dist-binary/.warmup-${target}"
  bun build --compile --target="$target" ./packages/cli/src/cli.ts --outfile "$warmup_file" >/dev/null
  rm -f "$warmup_file"

  if [[ ! -f "$runtime_path" ]]; then
    echo "Unable to locate Bun runtime cache at: ${runtime_path}" >&2
    exit 1
  fi
}

build_with_upx_linux_runtime() {
  local target="$1"
  local runtime_path="$2"
  local runtime_copy="$3"
  local output_file="$4"

  ensure_runtime_in_cache "$target" "$runtime_path"
  cp "$runtime_path" "$runtime_copy"
  chmod u+w "$runtime_copy"
  upx --best --lzma "$runtime_copy" >/dev/null

  bun build --compile --target="$target" --compile-executable-path "$runtime_copy" ./packages/cli/src/cli.ts --outfile "$output_file"

  rm -f "$runtime_copy"
}

if [[ "$USE_LINUX_UPX_RUNTIME" != "true" ]]; then
  npm run build:binaries --workspace=packages/cli
  exit 0
fi

if ! command -v upx >/dev/null 2>&1; then
  echo "USE_LINUX_UPX_RUNTIME=true requires 'upx' in PATH." >&2
  exit 1
fi

BUN_VERSION="$(bun --version)"
LINUX_X64_RUNTIME="$HOME/.bun/install/cache/bun-linux-x64-v${BUN_VERSION}"
LINUX_ARM64_RUNTIME="$HOME/.bun/install/cache/bun-linux-aarch64-v${BUN_VERSION}"

echo "Building binaries with UPX-compressed Bun runtimes for Linux targets."
mkdir -p ./packages/cli/dist-binary

bun build --compile --target=bun-darwin-arm64 ./packages/cli/src/cli.ts --outfile ./packages/cli/dist-binary/lac-darwin-arm64
bun build --compile --target=bun-darwin-x64 ./packages/cli/src/cli.ts --outfile ./packages/cli/dist-binary/lac-darwin-x64

build_with_upx_linux_runtime \
  bun-linux-arm64 \
  "$LINUX_ARM64_RUNTIME" \
  "./packages/cli/dist-binary/bun-linux-aarch64-v${BUN_VERSION}.upx" \
  "./packages/cli/dist-binary/lac-linux-arm64"

build_with_upx_linux_runtime \
  bun-linux-x64 \
  "$LINUX_X64_RUNTIME" \
  "./packages/cli/dist-binary/bun-linux-x64-v${BUN_VERSION}.upx" \
  "./packages/cli/dist-binary/lac-linux-x64"

bun build --compile --target=bun-windows-x64 ./packages/cli/src/cli.ts --outfile ./packages/cli/dist-binary/lac-win32-x64.exe
