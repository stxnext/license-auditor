#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
smoke_root_rel=".tmp/podman-desktop-binary-smoke"
smoke_root_abs="${repo_root}/${smoke_root_rel}"

run_macos_smoke="${SMOKE_RUN_MACOS:-true}"
run_windows_smoke="${SMOKE_RUN_WINDOWS:-false}"
build_binaries="${SMOKE_DESKTOP_BUILD_BINARIES:-true}"

image="${PODMAN_SMOKE_IMAGE:-docker.io/library/node:20-bookworm}"
windows_platform="${PODMAN_WINDOWS_PLATFORM:-linux/amd64}"

darwin_suffix=""
darwin_target=""
host_arch="$(uname -m)"
case "${host_arch}" in
  arm64|aarch64)
    darwin_suffix="arm64"
    darwin_target="bun-darwin-arm64"
    ;;
  x86_64|amd64)
    darwin_suffix="x64"
    darwin_target="bun-darwin-x64"
    ;;
  *)
    echo "Unsupported host architecture for macOS smoke: ${host_arch}" >&2
    exit 1
    ;;
esac

darwin_binary="${SMOKE_MACOS_BINARY:-${smoke_root_abs}/lac-darwin-${darwin_suffix}-baseline}"
windows_binary="${SMOKE_WINDOWS_BINARY:-${smoke_root_abs}/lac-win32-x64-baseline.exe}"

mkdir -p "${smoke_root_abs}"

if [[ "${build_binaries}" == "true" ]]; then
  if [[ "${run_macos_smoke}" == "true" ]]; then
    echo "Building macOS binary (${darwin_target})..."
    bun build --compile --target="${darwin_target}" ./packages/cli/src/cli.ts --outfile "${darwin_binary}"
  fi

  if [[ "${run_windows_smoke}" == "true" ]]; then
    echo "Building Windows binary (bun-windows-x64)..."
    bun build --compile --target=bun-windows-x64 ./packages/cli/src/cli.ts --outfile "${windows_binary}"
  fi
fi

if [[ "${run_macos_smoke}" == "true" ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "macOS smoke can only run on macOS hosts. Set SMOKE_RUN_MACOS=false to skip." >&2
    exit 1
  fi

  if [[ ! -f "${darwin_binary}" ]]; then
    echo "macOS binary not found: ${darwin_binary}" >&2
    exit 1
  fi

  echo "Running macOS smoke locally (no macOS container runtime)."
  mac_project_name="macos-react-app"
  mac_project="${smoke_root_abs}/${mac_project_name}"
  rm -rf "${mac_project}"
  (
    cd "${smoke_root_abs}"
    npm create --yes vite@latest "${mac_project_name}" -- --template react >/tmp/macos-vite-create.log
  )
  (cd "${mac_project}" && npm install >/tmp/macos-vite-install.log)

  set +e
  (
    cd "${mac_project}"
    "${darwin_binary}" --default-config --json macos-result.json > macos.log 2>&1
  )
  mac_exit=$?
  set -e

  if [[ "${mac_exit}" -ne 0 ]]; then
    echo "SMOKE_STATUS=FAIL: macOS binary exited non-zero (${mac_exit})"
    tail -n 40 "${mac_project}/macos.log" || true
    exit 1
  fi

  if [[ ! -f "${mac_project}/macos-result.json" ]]; then
    echo "SMOKE_STATUS=FAIL: macOS result file missing"
    exit 1
  fi

  echo "macOS smoke passed."
  ls -lh "${mac_project}/macos-result.json"
fi

if [[ "${run_windows_smoke}" == "true" ]]; then
  if [[ ! -f "${windows_binary}" ]]; then
    echo "Windows binary not found: ${windows_binary}" >&2
    exit 1
  fi

  if ! command -v podman >/dev/null 2>&1; then
    echo "SMOKE_STATUS=FAIL: podman is required for Windows smoke."
    exit 1
  fi

  echo "Running Windows smoke in Linux container with wine (Windows containers are not supported in this environment)."
  podman run --rm \
    --platform "${windows_platform}" \
    -v "${repo_root}:/workspace" \
    -w /workspace \
    -e SMOKE_ROOT_REL="${smoke_root_rel}" \
    -e WINDOWS_BINARY="/workspace/${smoke_root_rel}/$(basename "${windows_binary}")" \
    "${image}" \
    bash -lc '
      set -euo pipefail

      export DEBIAN_FRONTEND=noninteractive
      apt-get update >/tmp/win-apt-update.log
      apt-get install -y wine64 >/tmp/win-apt-install.log

      smoke_root="/workspace/${SMOKE_ROOT_REL}"
      project_name="windows-react-app"
      project_dir="${smoke_root}/${project_name}"
      rm -rf "${project_dir}"
      mkdir -p "${smoke_root}"

      cd "${smoke_root}"
      npm create --yes vite@latest "${project_name}" -- --template react >/tmp/win-vite-create.log
      cd "${project_dir}"
      npm install >/tmp/win-vite-install.log

      set +e
      wine "${WINDOWS_BINARY}" --default-config --json windows-result.json > windows.log 2>&1
      win_exit=$?
      set -e

      echo "WINDOWS_EXIT=${win_exit}"
      if [[ "${win_exit}" -ne 0 ]]; then
        echo "SMOKE_STATUS=FAIL: Windows binary exited non-zero"
        tail -n 50 windows.log || true
        exit 1
      fi

      if [[ ! -f windows-result.json ]]; then
        echo "SMOKE_STATUS=FAIL: windows-result.json missing"
        exit 1
      fi

      ls -lh windows-result.json
      echo "--- windows log tail ---"
      tail -n 25 windows.log || true
      echo "SMOKE_STATUS=PASS"
    '
else
  echo "Skipping Windows smoke by default (set SMOKE_RUN_WINDOWS=true to enable best-effort Wine test)."
fi

echo "SMOKE_STATUS=PASS (desktop)"
