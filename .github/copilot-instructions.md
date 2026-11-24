# EdgeTX Configurator

## Project direction

- `README.md` is the source of truth for the project's current scope: a new web-based configurator for [EdgeTX](https://github.com/EdgeTX/edgetx).
- The goal is to replace both [EdgeTX Companion](https://github.com/EdgeTX/edgetx/tree/main/companion) and [EdgeTX Buddy](https://github.com/EdgeTX/buddy). Consider both projects when clarifying migration requirements.
- Use the new [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator) as the UI/tooling design reference and this repository's landed implementation for architecture and conventions.
- `SETUP_TASKS.md` records the application foundation. `IMPLEMENTATION_TASKS.md` describes planned features, starting with Pocket ELRS / EdgeTX v2.12.4, lossless backup and offline restore.

## Commands

| Purpose                                      | Command                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Install locked dependencies                  | `npm ci`                                                                                                        |
| Development server                           | `npm run dev`                                                                                                   |
| Production build / preview                   | `npm run build` / `npm run preview`                                                                             |
| Application and tooling type checks          | `npm run typecheck`                                                                                             |
| Lint / fix lint issues                       | `npm run lint` / `npm run lint:fix`                                                                             |
| Check / apply formatting                     | `npm run format:check` / `npm run format`                                                                       |
| Unit tests once / watch                      | `npm test` / `npm run test:watch`                                                                               |
| Single unit-test file                        | `npm test -- tests/unit/AppShell.test.ts`                                                                       |
| Single named unit test                       | `npm test -- tests/unit/AppShell.test.ts -t "updates the heading"`                                              |
| Build and run browser smoke tests            | `npm run test:smoke`                                                                                            |
| Single browser spec                          | `npm run test:smoke -- tests/smoke/app.spec.ts`                                                                 |
| Install smoke browsers locally / on Linux CI | `npx playwright install chromium firefox webkit` / `npx playwright install --with-deps chromium firefox webkit` |
| Chromium-only smoke checks                   | `npm run test:smoke -- --project chromium`                                                                      |

`.github/workflows/checks.yml` runs formatting, lint, type checking, unit tests,
browser installation and smoke tests on pull requests and pushes to `main`.
`test:smoke` already builds the application; a separate preceding build is unnecessary.

## Architecture

- The current app is a client-side Vue 3/Vite shell using Nuxt UI's standalone integration. `index.html` loads `src/main.ts`, which installs the Nuxt UI Vue plugin and imports `src/styles/main.css`. `src/App.vue` supplies the `UApp` provider around `AppShell` and its `LocalFilesPanel`.
- `src/services/storage/local.ts` defines read-only file/blob and directory-entry ports plus explicit access errors. `browser.ts` wraps user-selected files and read-only directory handles; it requests only `mode: "read"` and exposes no source-write methods. `tests/unit/helpers/memoryStorage.ts` implements the same ports in memory.
- `LocalFilesPanel` offers unchanged-file downloads and optional native directory selection, with visible permission/cancellation/unsupported-browser states. It treats archives as opaque files and keeps selection ephemeral; workspace inventory and actual backups are later backlog tasks. Download requests are not reported as completed saves.
- `vite.config.ts` owns both Vite and Vitest configuration, sharing Vue and Nuxt UI transforms. Nuxt UI's auto-imports, generated declarations, routing integration and color-mode integration are disabled. Components/composables use explicit imports.
- `src/styles/main.css` imports Tailwind and Nuxt UI; the shell uses their theme utilities (`bg-default`, `text-default`) rather than a separate theme implementation.
- Type checking is split: `tsconfig.json` covers Vue/application code and unit tests with DOM/Vite types; `tsconfig.node.json` covers tooling/smoke tests with Node types and DOM libraries for browser-context Playwright callbacks. `typecheck` runs `vue-tsc` followed by `tsc`, independently of the Vite build.
- Unit tests are discovered only under `tests/unit/**/*.test.ts` and use jsdom/Vue Test Utils. Playwright discovers `tests/smoke/` with Chromium, Firefox and WebKit projects. Native directory adapter coverage uses Chromium; file/download fallbacks and error states cover all three engines. OS picker interaction is a separate manual check.
- Vite development uses `127.0.0.1:5173`; preview uses `127.0.0.1:4173`, with strict ports. Playwright manages its own preview server and refuses an existing one. Reports/traces/screenshots go to ignored `playwright-report/` and `test-results/`.

## Implementation and conventions

- Use Node `26.12.0` from `.nvmrc` and npm `11.20.0` from `package.json`. `.npmrc` enforces engine compatibility and exact saved dependency versions; update `package-lock.json` with dependency changes using the selected npm version.
- Components use PascalCase `.vue` filenames and Composition API `<script setup lang="ts">`. Keep imports explicit so type checking works before any Vite-generated files exist.
- Prettier owns formatting: four-space indentation, two spaces for JSON/YAML/Markdown, 120 columns, double quotes, semicolons, LF. ESLint owns correctness rules; do not duplicate formatter rules.
- ESLint's flat config assigns browser globals to source/unit tests and Node globals to tooling/smoke tests. Keep `eslint-config-prettier` last; TypeScript owns undefined-name checking in `.ts`/`.vue` files.
- Follow the backlog's data-preservation contract when implementing EdgeTX features: retain original/unknown data, distinguish `.etx` interchange from full SD backups, preserve target calibration, and qualify radio writes with pinned-format fixtures and matching hardware.
- `tests/fixtures/pocket-2.12.4/` contains reviewed, sanitized snapshots and profile/provenance metadata. YAML snapshots are excluded from Prettier to preserve checksums, line endings and intentionally invalid cases; verify with `npm test -- tests/unit/PocketFixtures.test.ts`. Raw `tests/data/pocket-fixtures/` inputs are private and ignored; never force-add them. Fixture preparation optionally uses Python 3's standard library as documented in the corpus README.
- `README.md` documents commands and dependency-audit limitations; follow its compatibility guidance when changing pinned tools. Keep it and these instructions synchronized with configuration changes.

## Browser tooling

- `.github/mcp.json` already configures interactive Playwright MCP through `npx`. Copilot CLI loads the workspace configuration after folder trust. The automated `@playwright/test` suite has its own browser installation and server lifecycle.
