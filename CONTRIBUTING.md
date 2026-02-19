# Contributing rules

## Local development and testing

1. Use Node.js 20 (recommended) or newer and Bun 1.3.8+

- If you use `nvm`, run `nvm use` (the project includes `.nvmrc`),
- CI uses Node.js 20 and Bun 1.3.9, so matching locally is recommended.

2. Install dependencies

- Run `bun install` in project root.

3. Build packages

- Run `bun run build` in root, turbo should handle building the app,
- If you encounter errors during build, check the code,
- Build order should be tooling > core > cli.

4. Run `bun run cli:init` in the root of the project

- Complete the configuration wizard.

5. Run `bun run cli` in the root of the project

- If you want to run the tool in a different directory, use `node [...path]/license-auditor/packages/cli/bin/lac.cjs`
- Be mindful of user permissions (eg. [chown on cli.js](https://stackoverflow.com/questions/53455753/ubuntu-create-react-app-fails-with-permission-denied/53455921#53455921))

### Testing

- To run unit tests, run `test:unit` from the project root
- To run E2E tests, run `test:e2e` from the project root

## Experimental 3.0 publishing

The experimental `3.0` release is published via `.github/workflows/release-experimental-3.yml`.

1. Bump versions for `@brainhubeu/lac` and all `@brainhubeu/lac-bin-*` packages.
2. Run workflow with `dry_run=true` first to validate binary build and package contents.
3. Run workflow with `dry_run=false` to publish.
4. Keep publish order unchanged: all platform `lac-bin-*` packages first, then `@brainhubeu/lac`.
