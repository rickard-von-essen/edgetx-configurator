# EdgeTX Configurator

## Project direction

- `README.md` is the source of truth for the project's current scope: a new web-based configurator for [EdgeTX](https://github.com/EdgeTX/edgetx).
- The goal is to replace both [EdgeTX Companion](https://github.com/EdgeTX/edgetx/tree/main/companion) and [EdgeTX Buddy](https://github.com/EdgeTX/buddy). Consider both projects when clarifying migration requirements.
- Use the new [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator) as the UI/tooling design reference and this repository's landed implementation for architecture and conventions.
- `SETUP_TASKS.md` records the application foundation. `IMPLEMENTATION_TASKS.md` describes planned features, starting with Pocket ELRS / EdgeTX v2.12.4, lossless backup and offline restore.

## Commands

| Purpose                                             | Command                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Install locked dependencies                         | `npm ci`                                                                                                        |
| Development server                                  | `npm run dev`                                                                                                   |
| Production build / preview                          | `npm run build` / `npm run preview`                                                                             |
| Application and tooling type checks                 | `npm run typecheck`                                                                                             |
| Lint / fix lint issues                              | `npm run lint` / `npm run lint:fix`                                                                             |
| Check / apply formatting                            | `npm run format:check` / `npm run format`                                                                       |
| Unit tests once / watch                             | `npm test` / `npm run test:watch`                                                                               |
| Single unit-test file                               | `npm test -- tests/unit/AppShell.test.ts`                                                                       |
| Single named unit test                              | `npm test -- tests/unit/AppShell.test.ts -t "updates the heading"`                                              |
| Build and run browser smoke tests                   | `npm run test:smoke`                                                                                            |
| Single browser spec                                 | `npm run test:smoke -- tests/smoke/app.spec.ts`                                                                 |
| Install smoke browsers locally / on Linux CI        | `npx playwright install chromium firefox webkit` / `npx playwright install --with-deps chromium firefox webkit` |
| Chromium-only smoke checks                          | `npm run test:smoke -- --project chromium`                                                                      |
| Codec spike tests                                   | `npm test -- tests/unit/NativeYaml.test.ts tests/unit/NativeReferences.test.ts`                                 |
| Generate / compare Companion verification artifacts | `npm run codec:fixtures` / `npm run codec:compare -- "/path/to/private-exports"`                                |

`.github/workflows/checks.yml` runs formatting, lint, type checking, unit tests,
browser installation and smoke tests on pull requests and pushes to `main`.
`test:smoke` already builds the application; a separate preceding build is unnecessary.

## Architecture

- The current app is a client-side Vue 3/Vite shell using Nuxt UI's standalone integration. `index.html` loads `src/main.ts`, which installs the Nuxt UI Vue plugin and imports `src/styles/main.css`. `src/App.vue` supplies the `UApp` provider around `AppShell` and its `LocalFilesPanel`.
- `src/services/storage/local.ts` defines read-only file/blob and directory-entry ports plus explicit access errors. `browser.ts` requests only `mode: "read"` and exposes no source-write methods. Known unreadable files are yielded as `unreadable-file` entries rather than silently dropped or stopping all sibling enumeration. `tests/unit/helpers/memoryStorage.ts` implements the ports in memory.
- `LocalFilesPanel` owns source selection, capture cancellation and the current shallow workspace reference. `WorkspacePanel` provides paginated inventory and in-memory Inventory/Backup/Restore navigation; archive operations remain later tasks. Closing/reloading drops the app's workspace; there is no automatic persistent user-data storage.
- `features/workspaces/workspace.ts` captures immutable raw entry/metadata snapshots through the storage ports. `services/storage/snapshot.ts` materializes file bytes with cancellable FileReader reads: retaining a source File/Blob view alone does not guarantee independent bytes after external edits. Downloads use captured blobs, not fresh source reads.
- `WORKSPACE_LIMITS` is the capture-policy source of truth: 512 MiB total, 64 MiB/file, 20,000 entries, 64 nested directory levels. Unreadable/over-budget files remain visible; entry/depth limits diagnose unscanned regions. Any capture/tree issue marks the workspace incomplete. User cancellation retains the previous workspace rather than publishing a partial replacement.
- Raw workspace completeness is distinct from content compatibility: content remains unvalidated and radio identity unverified until the codec/profile tasks. Keep unknown/malformed files and original bytes; do not infer a board from a filename or the project's Pocket baseline. Download requests are not reported as completed saves.
- `src/domain/edgetx/` is the F04 verification-only codec spike, not wired to editing or raw-workspace validation. It uses YAML failsafe scalars/CST ranges, explicit Pocket target context and typed field/reference rules. Never replace range patches with whole-document serialization or `toJS`: unowned bytes, masks and unknown fields must survive; aliases/tags/merges stay read-only.
- Native inspection caps are 1 MiB, 50,000 AST nodes (keys included), 64 container levels (root included). Duplicate-key checks are linear with parser duplicate checks disabled. Radio checksums cover exact body bytes; no `manuallyEdited` or zero-checksum bypass. Candidate output is offline verification data only; radio writes remain unqualified.
- Native numeric semantics differ by field: inputs +/-100 versus mixes +/-500; timers seconds; nine-character flight-mode masks have disabled bits; speaker volume is native -12..11 with a +12 UI offset. The pinned profile/rules and native reference decoders own these constraints; do not guess conversions or default unsupported references to `NONE`.
- `scripts/codec-verification.mjs` uses Vite's TS loader and dev-only fflate for test archives, with no HTTP/HMR listener or dependency scan. Generate its ignored `test-results/f04-companion/` artifacts after browser tests; matching-Companion reexports must stay outside the repository. Baseline/candidate loading and reexported model-field comparisons passed in Companion 2.12.4. This does not qualify whole-model conversion or radio writes.
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
