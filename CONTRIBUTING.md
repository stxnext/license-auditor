# Contributing rules

## Local development and testing

1. Use Node.js 20 (recommended) or newer and Bun 1.3.8+

- If you use `nvm`, run `nvm use` (the project includes `.nvmrc`),
- CI uses Node.js 20 and Bun 1.3.9, so matching locally is recommended.

2. Install dependencies

- Run `npm i` in project root.

3. Build packages

- Run `npm run build` in root, turbo should handle building the app,
- If you encounter errors during build, check the code,
- Build order should be tooling > core > cli.

4. Run `npm run cli:init` in the root of the project

- Complete the configuration wizard.

5. Run `npm run cli` in the root of the project

- If you want to run the tool in a different directory, use `node [...path]/license-auditor/packages/cli/bin/lac.cjs`
- Be mindful of user permissions (eg. [chown on cli.js](https://stackoverflow.com/questions/53455753/ubuntu-create-react-app-fails-with-permission-denied/53455921#53455921))

### Testing

- To run unit tests, run `test:unit` from the project root
- To run E2E tests, run `test:e2e` from the project root
