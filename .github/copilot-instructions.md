# EdgeTX Configurator

## Project direction

- `README.md` is the source of truth for the project's current scope: a new web-based configurator for [EdgeTX](https://github.com/EdgeTX/edgetx).
- The goal is to replace both [EdgeTX Companion](https://github.com/EdgeTX/edgetx/tree/main/companion) and [EdgeTX Buddy](https://github.com/EdgeTX/buddy). Consider both projects when clarifying migration requirements.
- The technology stack follows the new [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator). That checkout is a design reference, not a local dependency; follow this repository's implementation and conventions below.

## Implementation and conventions

- Use Node `26.12.0` from `.nvmrc` and npm `11.20.0` from `package.json`. Install with `npm ci`; commit lockfile updates with dependency changes.
- The app uses Vue 3 Composition API, strict TypeScript, Vite 8, Nuxt UI 4, and Tailwind CSS 4. This is not a Nuxt/SSR app.
- Write components as PascalCase `.vue` files with `<script setup lang="ts">`. Use explicit imports; Nuxt UI auto-imports and routing integration are disabled.
- `src/App.vue` wraps `src/components/AppShell.vue` in Nuxt UI's App provider. Shared CSS starts in `src/styles/main.css`; use semantic HTML and theme tokens/Tailwind utilities.
- Do not add router/state libraries, hardware access, native wrappers, PWA behavior, or migration features without concrete requirements.
- Prettier owns formatting: four-space indentation, two spaces for JSON/YAML/Markdown, 120 columns, double quotes, semicolons, LF. ESLint owns correctness rules; do not duplicate formatter rules.
- Configured app scripts are `npm run dev`, `npm run build`, and `npm run preview`. Vite build does not type-check.
- Validate changes with `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:smoke`. GitHub Actions runs these on pull requests and pushes to `main`; Git hooks are not required.
- Unit/component tests use Vitest, Vue Test Utils, and jsdom in `tests/unit/**/*.test.ts`. Use `npm test -- tests/unit/AppShell.test.ts` for one file, or add `-t "updates the heading"` for one test. `npm run test:watch` is interactive.
- Smoke tests use Playwright Test in `tests/smoke/` against a production build. Install Chromium with `npx playwright install chromium`; `npm run test:smoke -- tests/smoke/app.spec.ts` builds and selects one spec.
- Playwright owns the preview server on `127.0.0.1:4173`; do not reuse an existing server. Failure artifacts and build output are ignored.
- Keep actual commands, verification status, and conventions in `README.md`, `SETUP_TASKS.md`, and these instructions synchronized with configuration changes.

## Browser tooling

- `.github/mcp.json` configures Playwright MCP for browser automation in Copilot CLI. It runs through `npx` and requires Node.js 20 or newer. Copilot CLI loads this workspace configuration only after the user trusts the folder.
