#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${PODMAN_SMOKE_IMAGE:-docker.io/library/node:20-bookworm}"
smoke_root="/workspace/.tmp/podman-python-smoke"
platform="${PODMAN_SMOKE_PLATFORM:-}"

platform_args=()
if [[ -n "${platform}" ]]; then
  platform_args+=(--platform "${platform}")
fi

podman run --rm \
  "${platform_args[@]}" \
  -v "${repo_root}:/workspace" \
  -w /workspace \
  "${image}" \
  bash -lc "
    set -euo pipefail

    export DEBIAN_FRONTEND=noninteractive
    apt-get update >/tmp/apt-update.log
    apt-get install -y python3 python3-venv python3-pip curl ca-certificates git jq >/tmp/apt-install.log
    curl -fsSL https://bun.sh/install | bash >/tmp/bun-install.log
    curl -LsSf https://astral.sh/uv/install.sh | sh >/tmp/uv-install.log

    export BUN_INSTALL=/root/.bun
    export UV_INSTALL_DIR=/root/.local/bin
    export PATH=\${BUN_INSTALL}/bin:\${UV_INSTALL_DIR}:\${PATH}

    bun --version
    python3 --version
    uv --version

    bun install --frozen-lockfile >/tmp/bun-install-deps.log

    rm -rf \"${smoke_root}\"
    mkdir -p \"${smoke_root}\"

    # 1) Python environment source (.venv)
    venv_proj=\"${smoke_root}/venv-project\"
    mkdir -p \"\${venv_proj}\"
    python3 -m venv \"\${venv_proj}/.venv\"
    \"\${venv_proj}/.venv/bin/pip\" install --disable-pip-version-check --no-input requests==2.31.0 >/tmp/venv-pip-install.log

    set +e
    ROOT_DIR=\"\${venv_proj}\" bun /workspace/packages/cli/src/cli.ts --default-config --ecosystem python --json \"${smoke_root}/venv-result.json\" >\"${smoke_root}/venv-cli.log\" 2>&1
    venv_exit=\$?
    set -e

    # 2) uv.lock source
    uv_proj=\"${smoke_root}/uv-project\"
    mkdir -p \"\${uv_proj}\"
    cat > \"\${uv_proj}/pyproject.toml\" <<'PYPROJECT'
[project]
name = \"uv-project\"
version = \"0.1.0\"
requires-python = \">=3.10\"
dependencies = [
  \"requests==2.31.0\"
]
PYPROJECT

    (cd \"\${uv_proj}\" && uv lock >\"${smoke_root}/uv-lock.log\" 2>&1)

    set +e
    ROOT_DIR=\"\${uv_proj}\" bun /workspace/packages/cli/src/cli.ts --default-config --ecosystem python --production --json \"${smoke_root}/uv-result.json\" >\"${smoke_root}/uv-cli.log\" 2>&1
    uv_exit=\$?
    set -e

    # 3) requirements source (includes unsupported entry)
    req_proj=\"${smoke_root}/requirements-project\"
    mkdir -p \"\${req_proj}\"
    cat > \"\${req_proj}/requirements.txt\" <<'REQS'
requests==2.31.0
flask>=2.0
REQS

    set +e
    ROOT_DIR=\"\${req_proj}\" bun /workspace/packages/cli/src/cli.ts --default-config --ecosystem python --requirements \"\${req_proj}/requirements.txt\" --json \"${smoke_root}/req-result.json\" >\"${smoke_root}/req-cli.log\" 2>&1
    req_exit=\$?
    set -e

    summarize_json() {
      local file=\"\$1\"
      if [ -f \"\${file}\" ]; then
        jq -c '{whitelist:(.whitelist|length), blacklist:(.blacklist|length), unknown:(.unknown|length), notFound:(.notFound|length), needsUserVerification:(.needsUserVerification|length), errorResults:(.errorResults|length)}' \"\${file}\"
      else
        echo '{\"missing\":true}'
      fi
    }

    echo \"SMOKE_ROOT=${smoke_root}\"
    echo \"RESULT venv exit=\${venv_exit} summary=\$(summarize_json \"${smoke_root}/venv-result.json\")\"
    echo \"RESULT uv exit=\${uv_exit} summary=\$(summarize_json \"${smoke_root}/uv-result.json\")\"
    echo \"RESULT req exit=\${req_exit} summary=\$(summarize_json \"${smoke_root}/req-result.json\")\"

    echo \"--- venv log tail ---\"
    tail -n 20 \"${smoke_root}/venv-cli.log\" || true
    echo \"--- uv log tail ---\"
    tail -n 20 \"${smoke_root}/uv-cli.log\" || true
    echo \"--- req log tail ---\"
    tail -n 30 \"${smoke_root}/req-cli.log\" || true

    if [ \"\${venv_exit}\" -ne 0 ] || [ \"\${uv_exit}\" -ne 0 ] || [ \"\${req_exit}\" -ne 0 ]; then
      echo \"SMOKE_STATUS=FAIL: one or more lac runs returned non-zero exit status\"
      exit 1
    fi

    if grep -q \"Unsupported uv export requirement line\" \"${smoke_root}/uv-cli.log\"; then
      echo \"SMOKE_STATUS=FAIL: uv export parser produced unsupported-line warnings\"
      exit 1
    fi

    if jq -e '(.whitelist + .blacklist + .unknown) | any(.packagePath | startswith(\"undefined@\"))' \"${smoke_root}/venv-result.json\" >/dev/null; then
      echo \"SMOKE_STATUS=FAIL: venv result contains invalid packagePath entries\"
      exit 1
    fi

    if jq -e '(.whitelist + .blacklist + .unknown) | any(.packagePath | startswith(\"undefined@\"))' \"${smoke_root}/uv-result.json\" >/dev/null; then
      echo \"SMOKE_STATUS=FAIL: uv result contains invalid packagePath entries\"
      exit 1
    fi

    if ! jq -e '(.whitelist + .blacklist + .unknown) | map(.dependencySource) | any(. == \"uv-lock\")' \"${smoke_root}/uv-result.json\" >/dev/null; then
      echo \"SMOKE_STATUS=FAIL: uv result does not include uv-lock sourced dependencies\"
      exit 1
    fi

    echo \"SMOKE_STATUS=PASS\"
  "
