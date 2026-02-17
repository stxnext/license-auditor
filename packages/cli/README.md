# License Auditor CLI

## Prerequisites

### Supported package managers

- npm
- yarn classic (v1)
- yarn 2+
  - Applicable only for projects using `node_modules` installation. `Plug'n'Play` is not currently supported.
- pnpm
- bun

## Getting started

To start using License Auditor, in the root of your project run

```
npx @brainhubeu/lac init
```

Follow the configuration wizard and select the template which suits your project.

> **CAUTION: The default configuration should not be in any way interpreted as legal advice.**

Next, to conduct license audit run

```
npx @brainhubeu/lac
```

The results will be printed in the console.

## Available options

- `--verbose` - Verbose output (default: false)
- `--strict` - Treat dependency resolution warnings as failures (exit code 1)
- `--filter [filter]` - Filter verbose output by license status - whitelist, blacklist, or unknown
- `--json [json]` - Save the result to a JSON file. If no path is not provided, a file named license-auditor.results.json will be created in the current directory.
- `--production` - Skip the audit for licenses in development dependencies (default: false)
- `--default-config` - Run audit with default whitelist/blacklist configuration

**Verify dev dependencies if they generate code, embed assets, or otherwise impact the final product, as their licenses might impose restrictions. Always prioritize reviewing both when in doubt or if your project may be redistributed or commercialized.**

## Configuration file

### File structure

All licenses are sourced from [SPDX license list](https://spdx.org/licenses/)

- `whitelist` - array of SPDX license identifiers of licenses permitted within the project,
- `blacklist` - array of SPDX license identifiers of licenses prohibited within the project,
- `overrides` - an object with the specified severity:
  - `warn` - package should be omitted from audit, but it will produce a warning,
  - `off`- package should be completely omitted from the audit.

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

> **CAUTION: The default/strict configuration should not be in any way interpreted as legal advice.**

### Default configuration

LAC offers a default configuration for whitelist and blacklist, available by running the configuration wizard or using the `--default-config` flag. The rationale for selecting licenses for each list is available in [this Brainhub article about open source licenses](https://brainhub.eu/library/open-source-licenses-to-avoid). It describes licenses to be wary of as:

> You need to be careful about a few restrictive licenses, like GPL 3.0 or AGPL. In the worst-case scenario, you may be required to release your software under the same license, royalty-free.

> However, we shouldn't say these licenses are bad. They cause a legal risk or can make you rewrite the whole product, but only if you don't follow the rules associated with them.

> The key in managing licenses is to understand how they work, follow their rules, and ideally use software that helps to track the licenses in your product, so as not to break the law or cause problems to your product through inattention.

### Strict configuration

Strict configuration offers a more restrictive whitelist/blacklist preset. The aim was to cover as many licenses as viable, keeping to the guidelines described in the article above.

## Known issues

### "missing: some-package@>=3.0.0, required by some-other-package@5.0.1"

This is most likely caused by enabled legacy-peer-deps in npm, which makes npm skip installing peer dependencies. License auditor will show partial results (for packages found by npm until the error occurred). To see complete results you must turn the legacy-peer-deps off and fix any peer dependency conflicts.
