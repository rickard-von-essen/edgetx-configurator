# EdgeTX Configurator

This repository will hold the new web based Configurator for [EdgeTX](https://github.com/EdgeTX/edgetx)
to replace the [EdgeTX companion](https://github.com/EdgeTX/edgetx/tree/main/companion) and
[EdgeTX Buddy](https://github.com/EdgeTX/buddy).

The application follows the technology stack of the new [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator).

The repository currently provides an application shell, read-only local file
and directory access, RAM-only raw workspaces with inventory/diagnostics,
unchanged-file downloads, unit/component tests, browser smoke tests, code-style
checks, and CI. The
[setup checklist](SETUP_TASKS.md) records the implementation scope and decisions.

The [implementation backlog](IMPLEMENTATION_TASKS.md) covers planned backup/restore,
model editing, and broader Companion/Buddy replacement work, starting with
RadioMaster Pocket ELRS / EdgeTX v2.12.4.

The [curated compatibility fixtures](tests/fixtures/pocket-2.12.4/README.md)
contain minimized, de-identified radio and Companion captures. Verify their
digests and settings checksums with `npm test -- tests/unit/PocketFixtures.test.ts`.
The original `tests/data/pocket-fixtures/` input is private, ignored by Git and
Prettier, and can be moved outside the repository or removed after retaining a
private backup. Curated settings contain synthetic calibration and must never
be restored onto a radio.

## Development

The skeleton uses Vue 3 Composition API, strict TypeScript, Vite 8, Nuxt UI 4,
and Tailwind CSS 4. It is a client-side Vite app, not a Nuxt application.
Direct dependencies are pinned in `package.json`; `package-lock.json` locks the
complete dependency tree.

The baseline follows the setup investigation, with these adjustments:

- Node **26.12.0** and npm **11.20.0** use the existing, compatible local toolchain
  rather than requiring another runtime installation.
- Vue's Vite plugin is **6.0.11** rather than the reference's `6.0.1`, because the
  newer plugin declares Vite 8 support.
- Nuxt UI uses explicit imports and `router: false`; Vue Router and Pinia are
  deferred until the app needs them. PWA/offline support, native wrappers,
  localization, and radio features are outside this skeleton.
- ESLint **10.15.0** and typescript-eslint **8.73.0** include compatible advisory
  fixes beyond the reference versions.

### Prerequisites and installation

Select Node **26.12.0** from `.nvmrc` and npm **11.20.0** from `packageManager`.
The engines check rejects unsupported versions. With
[nvm](https://github.com/nvm-sh/nvm):

```sh
nvm install
nvm use
npm ci
npx playwright install chromium firefox webkit
```

Other Node managers work too: select the version in `.nvmrc` and ensure npm
matches `packageManager`. Browser installation is separate from `npm ci`.
On Linux CI, use `npx playwright install --with-deps chromium firefox webkit` to
include required system libraries. Chromium-only checks remain available with
`npm run test:smoke -- --project chromium`.

### Commands

| Purpose                                           | Command                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Start development server with HMR                 | `npm run dev`                                                      |
| Build static output in `dist/`                    | `npm run build`                                                    |
| Preview built output                              | `npm run preview`                                                  |
| Check application, test, and configuration types  | `npm run typecheck`                                                |
| Lint / fix lint issues                            | `npm run lint` / `npm run lint:fix`                                |
| Check / apply formatting                          | `npm run format:check` / `npm run format`                          |
| Run unit/component tests once / watch             | `npm test` / `npm run test:watch`                                  |
| Run one unit-test file                            | `npm test -- tests/unit/AppShell.test.ts`                          |
| Run one named unit test                           | `npm test -- tests/unit/AppShell.test.ts -t "updates the heading"` |
| Build and run Chromium/Firefox/WebKit smoke tests | `npm run test:smoke`                                               |
| Run one smoke-test file                           | `npm run test:smoke -- tests/smoke/app.spec.ts`                    |
| Run one browser project                           | `npm run test:smoke -- --project chromium`                         |

Development serves `http://127.0.0.1:5173`; preview serves
`http://127.0.0.1:4173`. Ports are strict: stop the process occupying the port
or pass a different port to an interactive server, for example
`npm run dev -- --port 5174`. Smoke tests require port 4173 to be free and manage
their own preview server; do not start one manually.

The smoke tests check the production page and reload, stylesheet application,
uncaught errors, console errors/Vue warnings, failed same-origin requests,
unchanged-file downloads, and selection/permission/cancellation behavior.
Failures are configured to produce a report in `playwright-report/` and
screenshots/traces in `test-results/`. These are generated files, not source.

If Playwright reports a missing browser, run `npx playwright install chromium firefox webkit`
after installing/updating dependencies. If npm reports `EBADENGINE`, select the
pinned Node/npm versions before retrying. No sibling repositories, credentials,
native SDKs, radio, or external services are used by the app or tests.

### Local workspaces (F02/F03)

Run `npm run dev` and open `http://127.0.0.1:5173`.

- **Select files or archives** accepts ordinary files, ZIPs and `.etx` archives.
  Successful captures detach their bytes into a RAM snapshot. Archives remain
  opaque files; no YAML/content validation or radio identification is attempted.
- **Select directory (read-only)** uses a supporting Chromium browser's native
  picker on HTTPS or localhost. The workspace records relative paths, nested and
  empty directories, file metadata, original bytes and diagnostics without
  writing to the source.
- **Inventory** paginates all recorded entries, including unknown, empty and
  malformed files. Unreadable/oversized files retain their metadata and diagnostic
  rows; the workspace is explicitly marked incomplete.
- **Download original** uses captured bytes even if the source changes afterward.
  The browser controls destination/completion; save outside the radio/SD card and
  verify the result. A file download or workspace snapshot is not a radio backup.
- **Backup** and **Restore** provide operation navigation only. Archive creation,
  inspection and offline restore are subsequent B01-B04 tasks.
- **Cancel capture** preserves the previous workspace. Byte reads are abortable;
  an uncancellable directory metadata operation may need to finish first.
- **Close workspace** releases the app's selection/snapshots without changing
  source files. Workspaces are not automatically persisted and disappear on reload.
- Browsers without the directory API retain file selection/download. Denied
  permissions and cancellation are shown explicitly.

The approved initial capture limits are **512 MiB total, 64 MiB per file,
20,000 recorded entries and 64 nested directory levels** (the source root is
level zero). Entry/depth limits stop further enumeration and identify unscanned
regions; an incomplete workspace never implies that all source files are known
or backed up. Files that fit the remaining byte budget can still be captured.
Capture is file-by-file, not an atomic filesystem transaction; keep the source
unchanged while opening it.
The byte limits apply to captured payload per workspace, not total browser heap:
the previous snapshot and temporary read buffers can coexist during replacement.
Opening another workspace replaces the previous snapshot only after capture
finishes; cancellation keeps the previous workspace.

Workspace-focused checks:

```sh
npm test -- tests/unit/Workspace.test.ts tests/unit/WorkspacePanel.test.ts
npm run test:smoke -- tests/smoke/workspace.spec.ts
```

Native OS picker selection/cancellation was manually confirmed for F02. Automated
Chromium coverage also reads nested origin-private filesystem handles and verifies
that a later source edit does not alter captured downloads; it does not automate
the OS picker itself. Firefox and WebKit cover file/download, workspace,
navigation, cancellation and diagnostic workflows.

### Code conventions and CI

Use TypeScript and Vue `<script setup lang="ts">`, PascalCase component filenames,
semantic HTML, and theme tokens/Tailwind utilities. Import components and
composables explicitly; type checking must not depend on generated auto-import
declarations or a previous Vite build.

Prettier owns formatting: four-space indentation by default, two spaces for
JSON/YAML/Markdown, 120-column print width, double quotes, semicolons, and LF.
ESLint checks source, tests, and configuration without duplicating formatting
rules. Unit/component tests live in `tests/unit/`; Playwright smoke tests live in
`tests/smoke/`. Add focused behavior tests, not snapshots of implementation details.

GitHub Actions runs formatting, lint, type checking, unit tests, and built-app
smoke tests on pull requests and pushes to `main`. Git hooks are not required.
`.github/mcp.json` configures interactive Playwright MCP browser tooling for
Copilot CLI; it is separate from the automated `@playwright/test` suite.

### Dependency audit

`npm audit --omit=dev` reports no production dependency advisories. The full
audit currently reports moderate development-only advisories through Vue Test
Utils' `js-beautify` dependencies (`glob`, `editorconfig`, and `minimatch`).
Compatible fixes have been applied; the remaining chain has no compatible
resolution from `npm audit fix`. Do not force upgrades or cross-major overrides
without verifying their compatibility.

## License

This project uses the [GNU General Public License v2.0](LICENSE), the same
license as EdgeTX.
