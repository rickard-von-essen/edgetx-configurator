# Basic application skeleton

Status: proposed task list, not an approved stack or an implemented application.

## Goal and scope

Deliver an otherwise empty EdgeTX Configurator that starts locally, builds as a
static web app, and includes working unit/component tests, browser smoke tests,
code-style checks, and CI. The eventual replacement of both Companion and Buddy
remains the project direction; migrating their features is not part of this setup.

No application scaffolding or dependencies are introduced by this document.
Commands below describe the proposed interface, not commands available today.

## Betaflight findings

Investigated the local Betaflight Configurator checkout at commit
[`568ac79a900356d3f2f117f1b90d4cf48fe424e3`](https://github.com/betaflight/betaflight-configurator/tree/568ac79a900356d3f2f117f1b90d4cf48fe424e3),
dated 2026-11-18. This is a reference snapshot, not a claim about the latest
upstream release.

| Area | Observed setup |
| --- | --- |
| Runtime and package manager | Node `24.21.0` in `.nvmrc`; `package.json` requires Node `^24.21.0` and npm `>=11.19.0`; npm lockfile |
| App framework | Vue `3.5.42`, TypeScript `6.0.3`, Vite `8.3.4`, Vue Vite plugin; ES modules |
| Components and styling | Nuxt UI `4.11.1` with its standalone Vite/Vue plugins; Tailwind CSS `4.3.3`; also existing Less styles |
| State and routing | Pinia and Vue Router; a minimal router also supplies route context for Nuxt UI links/buttons |
| Unit/component tests | Vitest `5.0.5`, Vue Test Utils `2.5.0`, jsdom `30.0.1`; tests under `test/` |
| Types and lint | Strict TypeScript, `vue-tsc --noEmit`, ESLint `10.10.0` flat config with TypeScript/Vue rules |
| Formatting | Prettier `3.9.6`, an empty Prettier config, and EditorConfig: four-space default indentation, two spaces for YAML/package JSON, LF, final newline, 120-column setting |
| Automation | GitHub Actions uses `.nvmrc`, `npm ci`, lint/tests, and a separate build workflow; Husky/lint-staged locally |
| Additional targets | PWA/service worker, Tauri desktop, Capacitor Android, Storybook, localization, and application-specific Vite plugins |

Dependency versions above are resolved versions from the reference lockfile
unless described as engine requirements. Its README still mentions an older npm
minimum; use its manifest rather than that prose when selecting a toolchain.

This is a **Vue + Vite app, not a Nuxt application**: Nuxt UI does not imply Nuxt,
SSR, or Nuxt server features. No Playwright test runner or browser-smoke command
is declared in the inspected package/test workflow; that is a proposed addition
here. The existing `.github/mcp.json` enables interactive Playwright tooling,
not a committed test suite or CI runner.

Reference files:

- [Manifest and scripts](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/package.json), [lockfile](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/package-lock.json), [.nvmrc](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/.nvmrc)
- [Vite and Vitest setup](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/vite.config.ts), [TypeScript config](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/tsconfig.json), [Vue initialization](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/src/components/init.ts)
- [Nuxt UI router integration](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/src/js/nuxt_ui_router.ts), [theme CSS](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/src/css/theme.css)
- [ESLint](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/eslint.config.js), [Prettier](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/.prettierrc.json), [EditorConfig](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/.editorconfig), [development conventions](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/AGENTS.md)
- [Component-test example](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/test/components/WikiButton.test.ts), [test workflow](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/.github/workflows/test.yml), [build workflow](https://github.com/betaflight/betaflight-configurator/blob/568ac79a900356d3f2f117f1b90d4cf48fe424e3/.github/workflows/build.yml)

## Recommended baseline

Use Vue 3 Composition API with `<script setup lang="ts">`, strict TypeScript,
Vite, npm, Nuxt UI/Tailwind, Vitest/Vue Test Utils/jsdom, ESLint, and Prettier.
Add Playwright Test for actual browser smoke tests.

Start with a single page and one small application-shell component. Register
Vue Router if required by the chosen Nuxt UI integration; it must not produce
missing-route-injection warnings. Do not copy Betaflight's legacy bootstrap,
multi-page entries, protocol boundary rules, global objects, branding, or asset
copying. Defer Pinia until shared state exists, and avoid empty feature folders.

Defer PWA/offline behavior, desktop/mobile wrappers, Storybook, localization
infrastructure, radio/USB/serial access, firmware flashing, persistence, and
Companion/Buddy migration. These need separate requirements, not placeholder
implementations or dependencies in an empty app.

## Implementation tasks

### 1. Confirm the baseline before scaffolding

- [ ] Approve the framework, npm, UI/styling, testing choices, and deferred scope above.
- [ ] Select exact compatible tool versions. Propose Node `24.21.0` and npm
  `11.19.0`, with the reference dependency versions as starting candidates;
  verify engine/peer requirements and choose a compatible Playwright version.
  Do not blindly use `latest` or assume the reference lockfile proves a new
  project's compatibility.
- [ ] Approve formatting: four-space indentation by default, two spaces for
  YAML/JSON, 120-column print width, double quotes, semicolons, LF, final newline.
  Make these explicit rather than depending on editor defaults.
- [ ] Record approved choices and any deviations in the README.

Done when: stack, package manager, versions, and conventions are agreed and
recorded. All scaffolding tasks depend on this decision.

### 2. Establish the toolchain and minimal Vue app

Depends on: 1.

- [ ] Create a private ES-module package with the approved dependencies and
  commit a newly generated `package-lock.json`; do not reuse Betaflight's lockfile.
- [ ] Pin Node in `.nvmrc` and npm in `packageManager`; declare compatible
  `engines`. Use the same selected versions locally and in CI.
- [ ] Add a conventional root `index.html`, `src/main.ts`, `src/App.vue`,
  `src/components/AppShell.vue`, and `src/styles/main.css`.
- [ ] Configure Vite/Vue and Nuxt UI's standalone integration, CSS imports, and
  any required router context. Keep project-specific configuration minimal.
- [ ] Render only an accessible main landmark with an "EdgeTX Configurator"
  heading and an empty content area. No demo counter, dashboard, connection
  controls, external service calls, or hardware prompts.
- [ ] Add strict TypeScript configuration and Vite declarations. Type-check
  application code, Vue SFCs, tests, and tool configuration with appropriate
  browser/Node types; do not hide errors with `any`.
- [ ] Add `dev`, `build`, `preview`, and `typecheck` scripts. Keep type checking
  explicit: Vite's production build alone is not a type check.
- [ ] Ignore dependencies, build output, local environment files, and test
  artifacts without ignoring source/configuration.

Done when: the dev server supports HMR, the production build can be previewed,
and both render the empty shell without runtime errors or Vue warnings.

### 3. Establish code style and static checks

Depends on: 2.

- [ ] Add ESLint flat configuration for TypeScript, Vue SFCs, tests, and
  browser/Node configuration files. Use recommended rules and reject unused
  imports/variables and explicit `any`.
- [ ] Add Prettier and EditorConfig with the approved settings; use
  `eslint-config-prettier` so ESLint does not fight the formatter.
- [ ] Add `lint`, `lint:fix`, `format`, and non-mutating `format:check` scripts.
  Lint all maintained source/tests/configuration, not generated output.
- [ ] Document PascalCase component filenames, Composition API, semantic HTML,
  and shared theme tokens/Tailwind utilities instead of arbitrary colors.
- [ ] Keep local hooks optional/deferred; CI must enforce the same checks
  without relying on an installed Git hook. Do not port Betaflight-specific
  custom lint plugins or architecture rules.

Done when: formatting is deterministic, checks cover the whole skeleton,
and a deliberate lint or formatting violation fails its corresponding check.

### 4. Add focused unit/component-test examples

Depends on: 2.

- [ ] Configure Vitest with Vue Test Utils and jsdom, sharing the required
  Vite transforms/aliases rather than maintaining conflicting setups.
- [ ] Limit Vitest discovery to `tests/unit/**/*.test.ts`; browser specs must
  not be picked up by the unit runner.
- [ ] Add `tests/unit/AppShell.test.ts` with a few behavior-focused examples:
  passing a title renders it as the page heading, changing that prop updates
  the heading, and supplied slot content appears in the main content area.
- [ ] Keep the shell's title/slot contract small and useful for the real app.
  Do not add a production utility/store solely to manufacture a test example.
- [ ] Clean up mounted wrappers and mocks between tests; add only DOM
  shims actually needed by the selected components.
- [ ] Make `npm test` run once and exit; provide `test:watch` separately and
  support selecting one file or named test.

Done when: tests run without a server or radio, and breaking the tested
rendering/update behavior makes the relevant example fail.

### 5. Add browser smoke tests against the production build

Depends on: 2.

- [ ] Install the approved `@playwright/test` dev dependency and add
  `playwright.config.ts` plus `tests/smoke/app.spec.ts`.
- [ ] Start with Chromium only; install its matching browser/system dependencies
  in CI. Document local browser installation separately from `npm ci`.
- [ ] Make `test:smoke` build the app, then run Playwright against Vite preview
  on a fixed loopback address/port. Let Playwright manage server readiness and
  shutdown; fail on a port conflict and do not reuse an unknown server in CI.
- [ ] Verify a successful page response, visible application heading/main
  landmark, and successful reload without relying on sleeps or screenshots
  alone. Use role-based locators and web-first assertions.
- [ ] Fail on uncaught page errors, browser console errors, Vue warnings, and
  failed same-origin asset loads; attach listeners before navigation. Keep the
  suite independent of hardware and external services.
- [ ] Capture a trace and screenshot on failure; ignore generated reports and
  test results. Limit Playwright discovery to `tests/smoke/`.

Done when: smoke tests exercise built JavaScript/CSS in a real browser, fail
on broken startup/assets, and leave no preview server running afterward.

### 6. Wire reproducible CI

Depends on: 3, 4, 5.

- [ ] Add a GitHub Actions workflow for pull requests and pushes to the actual
  default branch, using read-only repository permissions and npm caching.
- [ ] Set up the approved Node/npm versions and install using `npm ci`.
- [ ] Run formatting check, lint, type check, unit tests, Playwright browser
  installation, and browser smoke tests. Build through `test:smoke` rather
  than accidentally compiling twice.
- [ ] Upload smoke-test reports/traces/screenshots on failure and cancel
  superseded runs for the same branch.
- [ ] Ensure checks are non-interactive and failures propagate; do not use
  `continue-on-error` or a zero-tests success fallback.

Done when: a clean CI run passes, and intentional failures in each check make
the workflow fail.

### 7. Document and verify the contributor workflow

Depends on: 6.

- [ ] Update README with actual prerequisites, installation, dev/build/preview,
  formatting, lint, type checking, tests, and troubleshooting relevant to this
  skeleton. Keep the original project direction.
- [ ] Update `.github/copilot-instructions.md` to reflect the implementation
  that lands, replacing pre-implementation guidance with verified conventions.
- [ ] Document the distinction between interactive Playwright MCP tooling and
  the repository's automated Playwright Test suite.
- [ ] Verify the following command contract from a fresh checkout, adjusting
  documentation to the scripts actually implemented.

| Purpose | Proposed command |
| --- | --- |
| Select Node | `nvm use` (or install the version from `.nvmrc` by another manager) |
| Install locked dependencies | `npm ci` |
| Install smoke-test browser locally | `npx playwright install chromium` |
| Start development server | `npm run dev` |
| Build / serve production output | `npm run build` / `npm run preview` |
| Check types / lint / formatting | `npm run typecheck` / `npm run lint` / `npm run format:check` |
| Fix lint / formatting | `npm run lint:fix` / `npm run format` |
| Run unit tests once / watch | `npm test` / `npm run test:watch` |
| Run one unit-test file | `npm test -- tests/unit/AppShell.test.ts` |
| Run one named unit test | `npm test -- tests/unit/AppShell.test.ts -t "updates the heading"` |
| Build and run browser smoke tests | `npm run test:smoke` |
| Run one smoke-test file | `npm run test:smoke -- tests/smoke/app.spec.ts` |
| Install browser and OS dependencies in Linux CI | `npx playwright install --with-deps chromium` |

Done when: a contributor can follow the README from a fresh checkout to a
running empty app and passing checks, with no sibling repositories, credentials,
native SDKs, radio, or manually started test server.

## Completion criteria

All tasks above are complete, approved choices are reflected in committed
configuration/documentation, and CI is green. The deliverable is only a working
web-app foundation: no Companion/Buddy functionality or native packaging is
implied by completing this checklist.
