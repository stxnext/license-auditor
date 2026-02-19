#!/usr/bin/env bash
set -euo pipefail

TAG="experimental"
DRY_RUN="false"
CHECK_AUTH_ONLY="false"
CLEANUP_RELEASE_BINARIES="${CLEANUP_RELEASE_BINARIES:-true}"
SYNCED_PLATFORM_BINARIES="false"
EXPERIMENTAL_NUMBER=""

PACKAGE_DIRS=(
  "./packages/cli"
  "./packages/lac-bin-darwin-arm64"
  "./packages/lac-bin-darwin-x64"
  "./packages/lac-bin-linux-arm64"
  "./packages/lac-bin-linux-x64"
  "./packages/lac-bin-win32-arm64"
  "./packages/lac-bin-win32-x64"
)

usage() {
  cat <<USAGE
Usage: scripts/release-experimental-3.sh [options]

Options:
  --tag <name>      release dist-tag (default: experimental)
  --experimental-number <n>
                    set target prerelease version (3.0.0-experimental.<n>)
  --dry-run         Build/sync and run package dry-run only
  --check-auth      Verify registry auth and exit
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

  if package_exists_in_registry "$package_name" "$package_version"; then
    echo "Skipping ${package_name}@${package_version} (already published)."
    return 0
  fi

  (
    cd "$package_dir"
    bun publish --access public --tag "${TAG}"
  )
}

dry_run_package() {
  local package_dir="$1"

  (
    cd "$package_dir"
    bun pm pack --dry-run
  )
}

write_release_versions() {
  local target_version="$1"
  local dirs_json

  dirs_json="$(printf '%s\n' "${PACKAGE_DIRS[@]}" | node -e "const fs=require('fs'); const dirs=fs.readFileSync(0,'utf8').trim().split('\n').filter(Boolean); process.stdout.write(JSON.stringify(dirs));")"

  TARGET_VERSION="$target_version" PACKAGE_DIRS_JSON="$dirs_json" node <<'NODE'
const fs = require('fs');
const path = require('path');

const targetVersion = process.env.TARGET_VERSION;
const packageDirs = JSON.parse(process.env.PACKAGE_DIRS_JSON);

for (const dir of packageDirs) {
  const packagePath = path.join(dir, 'package.json');
  const json = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  json.version = targetVersion;
  if (dir === './packages/cli' && json.optionalDependencies) {
    for (const depName of Object.keys(json.optionalDependencies)) {
      if (depName.startsWith('@brainhubeu/lac-bin-')) {
        json.optionalDependencies[depName] = targetVersion;
      }
    }
  }
  fs.writeFileSync(packagePath, `${JSON.stringify(json, null, 2)}\n`);
}

const rootPackagePath = './package.json';
const rootJson = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
rootJson.version = targetVersion;
fs.writeFileSync(rootPackagePath, `${JSON.stringify(rootJson, null, 2)}\n`);
NODE

  VERSION_STRING="$target_version" node <<'NODE'
const fs = require('fs');
const filePath = './packages/cli/src/cli.ts';
const content = fs.readFileSync(filePath, 'utf8');
const pattern = /\.version\(\s*"[^"]+"\s*,\s*"-v, --version"\s*,\s*"Show version number"\s*\)/;
let matched = false;
const next = content.replace(pattern, () => {
  matched = true;
  return `.version("${process.env.VERSION_STRING}", "-v, --version", "Show version number")`;
});
if (!matched) {
  throw new Error('Could not update CLI version string in packages/cli/src/cli.ts');
}
fs.writeFileSync(filePath, next);
NODE
}

resolve_target_version() {
  local current_version
  local current_base
  local current_number
  local target_number

  current_version="$(read_package_field "./packages/cli" "version")"
  if [[ ! "$current_version" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-experimental\.([0-9]+)$ ]]; then
    echo "Unsupported CLI version format: ${current_version}. Expected x.y.z-experimental.n" >&2
    exit 1
  fi
  current_base="${BASH_REMATCH[1]}"
  current_number="${BASH_REMATCH[2]}"

  if [[ -n "$EXPERIMENTAL_NUMBER" ]]; then
    if [[ ! "$EXPERIMENTAL_NUMBER" =~ ^[0-9]+$ ]]; then
      echo "--experimental-number must be a non-negative integer." >&2
      exit 1
    fi
    target_number="$EXPERIMENTAL_NUMBER"
    if (( target_number < current_number )); then
      echo "Target experimental number (${target_number}) is lower than current local number (${current_number})." >&2
      exit 1
    fi
    echo "${current_base}-experimental.${target_number}"
    return 0
  fi

  echo "$current_version"
}

package_exists_in_registry() {
  local package_name="$1"
  local package_version="$2"
  bun pm view "${package_name}@${package_version}" version >/dev/null 2>&1
}

check_registry_release_state() {
  local target_version="$1"
  local existing_count=0
  local total_count=0
  local package_dir
  local package_name

  for package_dir in "${PACKAGE_DIRS[@]}"; do
    package_name="$(read_package_field "$package_dir" "name")"
    total_count=$((total_count + 1))
    if package_exists_in_registry "$package_name" "$target_version"; then
      existing_count=$((existing_count + 1))
    fi
  done

  if (( existing_count == total_count )); then
    echo "All release packages already exist in the registry for ${target_version}. Choose a higher --experimental-number." >&2
    exit 1
  fi

  if (( existing_count > 0 )); then
    echo "Partial release detected for ${target_version} (${existing_count}/${total_count} packages already published)." >&2
    echo "Continuing and publishing only missing packages." >&2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --experimental-number)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --experimental-number" >&2
        exit 1
      fi
      EXPERIMENTAL_NUMBER="${2:-}"
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
}

trap cleanup_runtime EXIT

if [[ "$TAG" == "latest" ]]; then
  echo "Refusing to publish experimental release under 'latest'. Use 'experimental'." >&2
  exit 1
fi

TARGET_VERSION="$(resolve_target_version)"
echo "Target release version: ${TARGET_VERSION}"

REQUIRES_TOKEN_AUTH="false"
if [[ "$CHECK_AUTH_ONLY" == "true" || "$DRY_RUN" == "false" ]]; then
  REQUIRES_TOKEN_AUTH="true"
fi

if [[ "$REQUIRES_TOKEN_AUTH" == "true" && -z "${NODE_AUTH_TOKEN:-}" ]]; then
  cat >&2 <<'EOF'
NODE_AUTH_TOKEN is required for this mode.
Export a publish-capable automation token before running:
  export NODE_AUTH_TOKEN=your_token_here
EOF
  exit 1
fi

if [[ "$REQUIRES_TOKEN_AUTH" == "true" || -n "${NODE_AUTH_TOKEN:-}" ]]; then
  echo "Checking registry authentication..."
  if ! NPM_USER="$(bun pm whoami 2>/dev/null)"; then
    echo "Registry auth check failed. Ensure NODE_AUTH_TOKEN is valid and has publish access." >&2
    exit 1
  fi
  echo "Authenticated as: ${NPM_USER}"
else
  echo "Skipping auth check (dry-run mode without token)."
fi

if [[ "$CHECK_AUTH_ONLY" == "true" ]]; then
  echo "Auth check passed."
  exit 0
fi

check_registry_release_state "$TARGET_VERSION"

write_release_versions "$TARGET_VERSION"

echo "Building platform binaries..."
bun run --cwd ./packages/cli build:binaries

echo "Syncing binaries to platform packages..."
bun run --cwd ./packages/cli sync:platform-binaries
SYNCED_PLATFORM_BINARIES="true"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Running package dry-runs..."
  dry_run_package ./packages/lac-bin-darwin-arm64
  dry_run_package ./packages/lac-bin-darwin-x64
  dry_run_package ./packages/lac-bin-linux-arm64
  dry_run_package ./packages/lac-bin-linux-x64
  dry_run_package ./packages/lac-bin-win32-arm64
  dry_run_package ./packages/lac-bin-win32-x64
  dry_run_package ./packages/cli
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
