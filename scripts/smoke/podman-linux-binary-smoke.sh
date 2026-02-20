#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${PODMAN_SMOKE_IMAGE:-docker.io/library/node:20-bookworm}"
platform="${PODMAN_SMOKE_PLATFORM:-}"
smoke_root_rel=".tmp/podman-linux-binary-smoke"
smoke_root_abs="${repo_root}/${smoke_root_rel}"

build_binaries="${SMOKE_LINUX_BUILD_BINARIES:-true}"
compare_upx="${SMOKE_LINUX_COMPARE_UPX:-true}"

platform_args=()
if [[ -n "${platform}" ]]; then
  platform_args+=(--platform "${platform}")
fi

resolve_arch_suffix() {
  local platform_value="$1"
  local container_arch

  if [[ -n "${platform_value}" ]]; then
    if [[ "${platform_value}" == *"amd64"* || "${platform_value}" == *"x86_64"* ]]; then
      echo "x64"
      return 0
    fi
    if [[ "${platform_value}" == *"arm64"* || "${platform_value}" == *"aarch64"* ]]; then
      echo "arm64"
      return 0
    fi
    echo "Unsupported PODMAN_SMOKE_PLATFORM value: ${platform_value}" >&2
    exit 1
  fi

  container_arch="$(podman run --rm "${platform_args[@]}" "${image}" uname -m | tr -d '\r')"
  case "${container_arch}" in
    arm64|aarch64)
      echo "arm64"
      ;;
    x86_64|amd64)
      echo "x64"
      ;;
    *)
      echo "Unsupported container architecture: ${container_arch}" >&2
      exit 1
      ;;
  esac
}

arch_suffix="$(resolve_arch_suffix "${platform}")"
linux_target="bun-linux-${arch_suffix}"
if [[ "${arch_suffix}" == "arm64" ]]; then
  linux_target="bun-linux-arm64"
fi

baseline_binary_host="${SMOKE_LINUX_BASELINE_BINARY:-${smoke_root_abs}/lac-linux-${arch_suffix}-baseline}"
upx_binary_host="${SMOKE_LINUX_UPX_BINARY:-${smoke_root_abs}/lac-linux-${arch_suffix}-upxruntime}"

baseline_binary_container="/workspace/${smoke_root_rel}/$(basename "${baseline_binary_host}")"
upx_binary_container="/workspace/${smoke_root_rel}/$(basename "${upx_binary_host}")"

ensure_runtime_cache() {
  local target="$1"
  local runtime_path="$2"
  local warmup_file="${smoke_root_abs}/.warmup-${target}"

  if [[ -f "${runtime_path}" ]]; then
    return 0
  fi

  bun build --compile --target="${target}" ./packages/cli/src/cli.ts --outfile "${warmup_file}" >/dev/null
  rm -f "${warmup_file}"

  if [[ ! -f "${runtime_path}" ]]; then
    echo "Unable to locate Bun runtime cache at: ${runtime_path}" >&2
    exit 1
  fi
}

if [[ "${build_binaries}" == "true" ]]; then
  mkdir -p "${smoke_root_abs}"

  echo "Building baseline Linux binary (${linux_target})..."
  bun build --compile --target="${linux_target}" ./packages/cli/src/cli.ts --outfile "${baseline_binary_host}"

  if [[ "${compare_upx}" == "true" ]]; then
    if ! command -v upx >/dev/null 2>&1; then
      echo "SMOKE_LINUX_COMPARE_UPX=true requires 'upx' in PATH." >&2
      exit 1
    fi

    bun_version="$(bun --version)"
    runtime_cache="${HOME}/.bun/install/cache/bun-linux-${arch_suffix}-v${bun_version}"
    if [[ "${arch_suffix}" == "arm64" ]]; then
      runtime_cache="${HOME}/.bun/install/cache/bun-linux-aarch64-v${bun_version}"
    fi

    ensure_runtime_cache "${linux_target}" "${runtime_cache}"

    runtime_copy="${smoke_root_abs}/bun-runtime-${arch_suffix}.upx"
    cp "${runtime_cache}" "${runtime_copy}"
    chmod u+w "${runtime_copy}"
    upx --best --lzma "${runtime_copy}" >/dev/null

    echo "Building Linux binary from UPX-compressed Bun runtime..."
    bun build --compile --target="${linux_target}" --compile-executable-path "${runtime_copy}" ./packages/cli/src/cli.ts --outfile "${upx_binary_host}"
    rm -f "${runtime_copy}"
  fi
fi

if [[ ! -f "${baseline_binary_host}" ]]; then
  echo "Baseline binary not found: ${baseline_binary_host}" >&2
  exit 1
fi

if [[ "${compare_upx}" == "true" && ! -f "${upx_binary_host}" ]]; then
  echo "UPX binary not found: ${upx_binary_host}" >&2
  exit 1
fi

podman run --rm \
  "${platform_args[@]}" \
  -v "${repo_root}:/workspace" \
  -w /workspace \
  -e SMOKE_ROOT_REL="${smoke_root_rel}" \
  -e BASELINE_BINARY="${baseline_binary_container}" \
  -e UPX_BINARY="${upx_binary_container}" \
  -e COMPARE_UPX="${compare_upx}" \
  "${image}" \
  bash -lc '
    set -euo pipefail

    echo "Container architecture: $(uname -m)"
    echo "Node: $(node -v)"
    echo "npm: $(npm -v)"

    smoke_root="/workspace/${SMOKE_ROOT_REL}"
    project_name="react-app"
    project_dir="${smoke_root}/${project_name}"
    rm -rf "${project_dir}"
    mkdir -p "${smoke_root}"

    cd "${smoke_root}"
    npm create --yes vite@latest "${project_name}" -- --template react >/tmp/vite-create.log
    cd "${project_dir}"
    npm install >/tmp/vite-install.log

    set +e
    "${BASELINE_BINARY}" --default-config --json baseline.json > baseline.log 2>&1
    baseline_exit=$?
    set -e

    upx_exit=0
    if [[ "${COMPARE_UPX}" == "true" ]]; then
      set +e
      "${UPX_BINARY}" --default-config --json upx.json > upx.log 2>&1
      upx_exit=$?
      set -e
    fi

    echo "BASELINE_EXIT=${baseline_exit}"
    if [[ "${COMPARE_UPX}" == "true" ]]; then
      echo "UPX_EXIT=${upx_exit}"
    fi

    ls -lh baseline.json
    if [[ "${COMPARE_UPX}" == "true" ]]; then
      ls -lh upx.json
      sha256sum baseline.json upx.json
      cmp -s baseline.json upx.json && echo "JSON_EQUAL=yes" || echo "JSON_EQUAL=no"
    fi

    echo "--- baseline log tail ---"
    tail -n 20 baseline.log || true
    if [[ "${COMPARE_UPX}" == "true" ]]; then
      echo "--- upx log tail ---"
      tail -n 20 upx.log || true
    fi

    if [[ "${baseline_exit}" -ne 0 ]]; then
      echo "SMOKE_STATUS=FAIL: baseline binary exited non-zero"
      exit 1
    fi

    if [[ "${COMPARE_UPX}" == "true" ]]; then
      if [[ "${upx_exit}" -ne 0 ]]; then
        echo "SMOKE_STATUS=FAIL: upx binary exited non-zero"
        exit 1
      fi
      if ! cmp -s baseline.json upx.json; then
        echo "SMOKE_STATUS=FAIL: baseline and upx outputs differ"
        exit 1
      fi
    fi

    echo "SMOKE_STATUS=PASS"
  '
