# EdgeTX Configurator

## Project direction

- `README.md` is the source of truth for the project's current scope: a new web-based configurator for [EdgeTX](https://github.com/EdgeTX/edgetx).
- The goal is to replace both [EdgeTX Companion](https://github.com/EdgeTX/edgetx/tree/main/companion) and [EdgeTX Buddy](https://github.com/EdgeTX/buddy). Consider both projects when clarifying migration requirements.
- The intended technology stack follows the new [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator). This is a design reference, not a local dependency or an implemented architecture.

## Establishing the implementation

- The repository is at the pre-implementation stage. Confirm concrete framework, package-manager, and version choices before adding application scaffolding; the README does not pin them.
- When introducing tooling, document the actual setup, build, lint, and test commands, including a single-test invocation, in `README.md` and update these instructions.
- Base future architecture and convention guidance on the implementation that lands here, rather than assuming this repository shares upstream projects' file layout or commands.

## Browser tooling

- `.github/mcp.json` configures Playwright MCP for browser automation in Copilot CLI. It runs through `npx` and requires Node.js 20 or newer. Copilot CLI loads this workspace configuration only after the user trusts the folder.
