#!/usr/bin/env bash
set -euo pipefail

TAG="experimental"
DRY_RUN="false"
CHECK_AUTH_ONLY="false"
CLEANUP_RELEASE_BINARIES="${CLEANUP_RELEASE_BINARIES:-true}"
SYNCED_PLATFORM_BINARIES="false"
TEMP_NPM_CONFIG_FILE=""

usage() {
  cat <<USAGE
Usage: scripts/release-experimental-3.sh [options]

Options:
  --tag <name>      npm dist-tag (default: experimental)
  --dry-run         Build/sync and run npm pack --dry-run only
  --check-auth      Verify npm auth and exit
  -h, --help        Show this help
USAGE
}

read_package_field() {
  local package_dir="$1"
  local field="$2"
  node -e "const j=require('./${package_dir}/package.json'); process.stdout.write(j['${field}']);"
}

publish_if_missing() {
  local package_dir="$1"
  local package_name
  local package_version

  package_name="$(read_package_field "$package_dir" "name")"
  package_version="$(read_package_field "$package_dir" "version")"

  if npm view "${package_name}@${package_version}" version --json >/dev/null 2>&1; then
    echo "Skipping ${package_name}@${package_version} (already published)."
    return 0
  fi

  npm publish "$package_dir" --access public --tag "${TAG}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --check-auth)
      CHECK_AUTH_ONLY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cleanup_generated_binaries() {
  rm -f \
    ./packages/lac-bin-darwin-arm64/bin/lac \
    ./packages/lac-bin-darwin-x64/bin/lac \
    ./packages/lac-bin-linux-arm64/bin/lac \
    ./packages/lac-bin-linux-x64/bin/lac \
    ./packages/lac-bin-win32-arm64/bin/lac.exe \
    ./packages/lac-bin-win32-x64/bin/lac.exe

  local placeholder='Binary is generated during release from packages/cli/dist-binary.'
  for file in \
    ./packages/lac-bin-darwin-arm64/bin/README.md \
    ./packages/lac-bin-darwin-x64/bin/README.md \
    ./packages/lac-bin-linux-arm64/bin/README.md \
    ./packages/lac-bin-linux-x64/bin/README.md \
    ./packages/lac-bin-win32-arm64/bin/README.md \
    ./packages/lac-bin-win32-x64/bin/README.md
  do
    if [[ ! -f "$file" ]]; then
      printf '%s\n' "$placeholder" > "$file"
    fi
  done
}

cleanup_runtime() {
  if [[ "$CLEANUP_RELEASE_BINARIES" == "true" && "$SYNCED_PLATFORM_BINARIES" == "true" ]]; then
    cleanup_generated_binaries
  fi

  if [[ -n "$TEMP_NPM_CONFIG_FILE" && -f "$TEMP_NPM_CONFIG_FILE" ]]; then
    rm -f "$TEMP_NPM_CONFIG_FILE"
  fi
}

trap cleanup_runtime EXIT

if [[ "$TAG" == "latest" ]]; then
  echo "Refusing to publish experimental release under 'latest'. Use 'experimental'." >&2
  exit 1
fi

REQUIRES_TOKEN_AUTH="false"
if [[ "$CHECK_AUTH_ONLY" == "true" || "$DRY_RUN" == "false" ]]; then
  REQUIRES_TOKEN_AUTH="true"
fi

if [[ "$REQUIRES_TOKEN_AUTH" == "true" && -z "${NODE_AUTH_TOKEN:-}" ]]; then
  cat >&2 <<'EOF'
NODE_AUTH_TOKEN is required for this mode.
Export a publish-capable npm automation token before running:
  export NODE_AUTH_TOKEN=your_token_here
EOF
  exit 1
fi

if [[ -n "${NODE_AUTH_TOKEN:-}" ]]; then
  TEMP_NPM_CONFIG_FILE="$(mktemp)"
  cat > "$TEMP_NPM_CONFIG_FILE" <<'EOF'
save-exact=true
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
EOF
  export NPM_CONFIG_USERCONFIG="$TEMP_NPM_CONFIG_FILE"
fi

echo "Checking npm authentication..."
if ! NPM_USER="$(npm whoami 2>/dev/null)"; then
  echo "npm auth check failed. Ensure NODE_AUTH_TOKEN is valid and has publish access." >&2
  exit 1
fi

echo "Authenticated as: ${NPM_USER}"

if [[ "$CHECK_AUTH_ONLY" == "true" ]]; then
  echo "Auth check passed."
  exit 0
fi

echo "Building platform binaries..."
npm run build:binaries --workspace=packages/cli

echo "Syncing binaries to platform packages..."
npm run sync:platform-binaries --workspace=packages/cli
SYNCED_PLATFORM_BINARIES="true"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Running package dry-runs..."
  npm pack --dry-run ./packages/lac-bin-darwin-arm64
  npm pack --dry-run ./packages/lac-bin-darwin-x64
  npm pack --dry-run ./packages/lac-bin-linux-arm64
  npm pack --dry-run ./packages/lac-bin-linux-x64
  npm pack --dry-run ./packages/lac-bin-win32-arm64
  npm pack --dry-run ./packages/lac-bin-win32-x64
  npm pack --dry-run ./packages/cli
  echo "Dry-run completed successfully."
  exit 0
fi

echo "Publishing platform packages with tag '${TAG}'..."
publish_if_missing ./packages/lac-bin-darwin-arm64
publish_if_missing ./packages/lac-bin-darwin-x64
publish_if_missing ./packages/lac-bin-linux-arm64
publish_if_missing ./packages/lac-bin-linux-x64
publish_if_missing ./packages/lac-bin-win32-arm64
publish_if_missing ./packages/lac-bin-win32-x64

echo "Publishing @brainhubeu/lac with tag '${TAG}'..."
publish_if_missing ./packages/cli

echo "Release publish completed."
