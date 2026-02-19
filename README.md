# license-auditor

## Prerequisites

### Node.js and Bun

-   Node.js 20 or newer is required for workspace tooling and CI.
-   Bun 1.3.8 or newer is required to build local CLI binaries.
-   Published `@brainhubeu/lac` installs with prebuilt platform binaries, so end users do not need Bun installed.

### Supported package managers

-   npm
-   yarn classic (v1)
-   yarn 2+
    -   Applicable only for projects using `node_modules` installation. `Plug'n'Play` is not currently supported.
-   pnpm
-   bun

## Getting started

To start using License Auditor, in the root of your project run

```
npx @brainhubeu/lac init
```

Follow the configuration wizard and select the template which suits your project.

> [!CAUTION]
> The default configuration should not be in any way interpreted as legal advice.

Next, to conduct license audit run

```
npx @brainhubeu/lac
```

The results will be printed in the console.

## Available options

-   `--verbose` - Verbose output (default: false)
-   `--strict` - Treat dependency resolution warnings as failures (exit code 1)
-   `--filter [filter]` - Filter verbose output by license status - whitelist, blacklist, or unknown
-   `--json [json]` - Save the result to a JSON file. If no path is provided, a file named license-auditor.results.json will be created in the current directory.
-   `--production` - Skip the audit for licenses in development dependencies (default: false)
-   `--default-config` - Run audit with default whitelist/blacklist configuration
-   `--filter-regex [regex]` - Run audit with a custom regex filter that will be applied to the package name
-   `--bail [number]` - Flag controls program process's exit status, causing it to exit with status 1 if the number of blacklisted licenses exceeds the specified value; by default, it is set to Infinity, meaning the process exits with status 0 regardless of blacklisted licenses unless the flag is explicitly set.

> [!IMPORTANT]
> Verify dev dependencies if they generate code, embed assets, or otherwise impact the final product, as their licenses might impose restrictions. Always prioritize reviewing both when in doubt or if your project may be redistributed or commercialized.

## Configuration file

### File structure

All licenses are sourced from [SPDX license list](https://spdx.org/licenses/)

-   `whitelist` - array of SPDX license identifiers of licenses permitted within the project,
-   `blacklist` - array of SPDX license identifiers of licenses prohibited within the project,
-   `overrides` - an object with the specified severity:
-   `warn` - package should be omitted from audit, but it will produce a warning,
-   `off`- package should be completely omitted from the audit.

To use `ConfigType` and enable IntelliSense license suggestions in the configuration file, run:

```
npm i --save-dev @brainhubeu/lac
```

Then, in JS/MJS configuration at the top of the file add:

```js
/**
 * @type {import('@brainhubeu/lac').ConfigType}
 */
```

In TS configuration:

```js
import type { ConfigType } from "@brainhubeu/lac";

const config: ConfigType = {
  ...
};
```

> [!CAUTION]
> The default/strict configuration should not be in any way interpreted as legal advice.

### Default configuration

LAC offers a default configuration for whitelist and blacklist, available by running the configuration wizard or using the `--default-config` flag. The rationale for selecting licenses for each list is available in [this Brainhub article about open source licenses](https://brainhub.eu/library/open-source-licenses-to-avoid). It describes licenses to be wary of as:

> You need to be careful about a few restrictive licenses, like GPL 3.0 or AGPL. In the worst-case scenario, you may be required to release your software under the same license, royalty-free.

> However, we shouldn't say these licenses are bad. They cause a legal risk or can make you rewrite the whole product, but only if you don't follow the rules associated with them.

> The key in managing licenses is to understand how they work, follow their rules, and ideally use software that helps to track the licenses in your product, so as not to break the law or cause problems to your product through inattention.

### Strict configuration

Strict configuration offers a more restrictive whitelist/blacklist preset. The aim was to cover as many licenses as viable, keeping to the guidelines described in the article above.

## Verbose warnings

### "We’ve found a license file, but no matching licenses in it in path" or "We've found few license files, but we could not match a license for some of them for package"
When the license file is found, but we are not sure what license it contains, we show this warning. Some packages contain more licenses in a single license file, e.g. when the author decided to include bundled dependencies licenses. It is important to review the file manually. 

## JSON output

The JSON output is a JSON object with the following structure:
```ts
type Output = {
  "whitelist": Package[],
  "blacklist": Package[],
  "unknown": Package[], 
  "notFound": Package[]
}

type Package = {
  packageName: string,
  packagePath: string,
  status: 'whitelist' | 'blacklist' | 'unknown',
  licensePath: string[], // paths to all license sources: license files and package.json files
  verificationStatus: 
    'ok'
    | 'someButNotAllLicensesWhitelisted' // found multiple licenses, but some (not all) are not whitelisted
    | 'licenseFilesExistButSomeAreUncertain' // found multiple license files but we couldn't detect license in some of them
    | 'licenseFileExistsButUnknownLicense' // found a license file but we couldn't detect license
    | 'licenseFileNotFound' // we couldn't find a license file
  licenses: License[],
};

type License = {
  // ... license details as fetched from SPDX database like license name and SPDX ID
  source: 
    'package.json-license' // single license found in package.json in "license" field
    | 'package.json-licenses' // license found in package.json in "licenses" field
    | 'package.json-license-expression' // license found in package.json in "license" field but expression detected (e.g. "MIT OR Apache-2.0")
    | 'package.json-legacy' // license found in package.json in "license" field but in outdated format (e.g. object)
    | 'license-file-content' // license detected in license file content
    | 'license-file-content-keywords' // license detected in license file content using keywords (e.g. "MIT" or "Apache-2.0")
};
```

## CI integration

You can add License Auditor to your CI pipeline to ensure that the project's dependencies comply with the license policy. To do so, add the following command to your CI configuration:

```
  license-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Check out code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.9

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      ### This part below should be added to your CI configuration file. ###

      - name: Install lac
        run: npm i -g @brainhubeu/lac

      - name: Run audit
        run: lac --default-config --strict --bail 1
```

## Experimental 3.0 release process

The experimental `3.0` release uses npm distribution with embedded platform binaries and a prerelease version (for example `3.0.0-experimental.0`).

### Required secrets and access

- GitHub Actions secret `NPM_TOKEN` with publish access to:
  - `@brainhubeu/lac`
  - `@brainhubeu/lac-bin-*`
- npm package versions must be bumped before running publish (npm will reject already published versions).

### Publish order

1. Build all CLI binaries.
2. Sync binaries into platform packages.
3. Publish platform packages:
   - `@brainhubeu/lac-bin-darwin-arm64`
   - `@brainhubeu/lac-bin-darwin-x64`
   - `@brainhubeu/lac-bin-linux-arm64`
   - `@brainhubeu/lac-bin-linux-x64`
   - `@brainhubeu/lac-bin-win32-arm64`
   - `@brainhubeu/lac-bin-win32-x64`
4. Publish `@brainhubeu/lac` (root CLI package with `optionalDependencies` on platform packages).

Note: with current Bun `1.3.x`, `win32-arm64` binary compilation is unavailable in this flow, so `@brainhubeu/lac-bin-win32-arm64` is populated with the `win32-x64` executable.

### Local release script

Use a single script for auth check, dry-run, and publish:

```bash
export NODE_AUTH_TOKEN=your_publish_capable_npm_token
npm run release:experimental -- --check-auth
npm run release:experimental -- --experimental-number 1 --dry-run
npm run release:experimental -- --experimental-number 1
```

Optional custom tag:

```bash
npm run release:experimental -- --tag experimental
```

Notes:
- `NODE_AUTH_TOKEN` is required for `--check-auth` and real publish mode.
- `--dry-run` does not require `NODE_AUTH_TOKEN`.
- `--experimental-number <n>` targets `3.0.0-experimental.<n>` based on current base version.
- Script blocks publishing when `<n>` is lower than current local experimental number.
- Script skips packages already published at the same version, so you can safely re-run after a partial release.

### GitHub Actions workflow

Use `.github/workflows/release-experimental-3.yml`.

- Trigger: manual (`workflow_dispatch`)
- Inputs:
  - `npm_tag` (default: `experimental`)
  - `dry_run` (default: `true`)
- Behavior:
  - `dry_run=true`: builds binaries, validates package contents with `npm pack --dry-run`, does not publish.
  - `dry_run=false`: publishes platform packages first, then publishes `@brainhubeu/lac`.
  - Guardrail: publishing with `npm_tag=latest` is blocked for this workflow.

## Known issues

### "missing: some-package@>=3.0.0, required by some-other-package@5.0.1"

This is most likely caused by enabled legacy-peer-deps in npm, which makes npm skip installing peer dependencies. License auditor will show partial results (for packages found by npm until the error occurred). To see complete results you must turn the legacy-peer-deps off and fix any peer dependency conflicts.
