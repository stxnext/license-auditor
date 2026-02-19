#!/usr/bin/env bash
set -euo pipefail

TAG="latest"
DRY_RUN="false"
CHECK_AUTH_ONLY="false"
RELEASE_VERSION=""
CLEANUP_RELEASE_BINARIES="${CLEANUP_RELEASE_BINARIES:-true}"
SYNCED_PLATFORM_BINARIES="false"
TEMP_NPM_CONFIG_FILE=""

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
Usage: scripts/release-stable-3.sh [options]

Options:
  --version <x.y.z> stable release version
  --tag <name>      npm dist-tag (default: latest)
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

package_exists_in_registry() {
  local package_name="$1"
  local package_version="$2"
  npm view "${package_name}@${package_version}" version --json >/dev/null 2>&1
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

  npm publish "$package_dir" --access public --tag "${TAG}"
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
const next = content.replace(
  /\.version\("([^"]+)", "-v, --version", "Show version number"\)/,
  `.version("${process.env.VERSION_STRING}", "-v, --version", "Show version number")`
);
if (next === content) {
  throw new Error('Could not update CLI version string in packages/cli/src/cli.ts');
}
fs.writeFileSync(filePath, next);
NODE
}

extract_base_version() {
  local version="$1"
  if [[ "$version" =~ ^([0-9]+\.[0-9]+\.[0-9]+)(-.*)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

semver_lt() {
  local left="$1"
  local right="$2"
  LEFT="$left" RIGHT="$right" node <<'NODE'
const parse = (value) => value.split('.').map((part) => Number(part));
const left = parse(process.env.LEFT);
const right = parse(process.env.RIGHT);
let result = false;
for (let index = 0; index < 3; index += 1) {
  if (left[index] < right[index]) {
    result = true;
    break;
  }
  if (left[index] > right[index]) {
    break;
  }
}
process.exit(result ? 0 : 1);
NODE
}

resolve_target_version() {
  local current_version
  local current_base

  current_version="$(read_package_field "./packages/cli" "version")"
  current_base="$(extract_base_version "$current_version" || true)"
  if [[ -z "$current_base" ]]; then
    echo "Unsupported CLI version format: ${current_version}" >&2
    exit 1
  fi

  if [[ -z "$RELEASE_VERSION" ]]; then
    echo "--version is required for stable release mode." >&2
    exit 1
  fi

  if [[ ! "$RELEASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "--version must match stable semver x.y.z." >&2
    exit 1
  fi

  if semver_lt "$RELEASE_VERSION" "$current_base"; then
    echo "Target stable version (${RELEASE_VERSION}) is lower than current local base version (${current_base})." >&2
    exit 1
  fi

  echo "$RELEASE_VERSION"
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
    echo "All release packages already exist in npm for ${target_version}. Choose a higher stable version." >&2
    exit 1
  fi

  if (( existing_count > 0 )); then
    echo "Partial release detected for ${target_version} (${existing_count}/${total_count} packages already published)." >&2
    echo "Continuing and publishing only missing packages." >&2
  fi
}

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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --version" >&2
        exit 1
      fi
      RELEASE_VERSION="${2:-}"
      shift 2
      ;;
    --tag)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --tag" >&2
        exit 1
      fi
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

trap cleanup_runtime EXIT

TARGET_VERSION="$(resolve_target_version)"
echo "Target release version: ${TARGET_VERSION}"

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

check_registry_release_state "$TARGET_VERSION"

write_release_versions "$TARGET_VERSION"

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
