# EdgeTX Configurator implementation backlog

Status: F01 compatibility fixtures, F02 local access, F03 raw workspaces and the
F04 qualified scalar-codec spike are implemented; remaining items are planned work. The application foundation is
covered by [SETUP_TASKS.md](SETUP_TASKS.md). This backlog turns the Companion/Buddy
replacement goal into incremental feature milestones.

## Recommended starting point

Deliver **lossless backup and verified offline restore first**, then browse
models and make small offline edits. Only enable direct radio writes after
compatibility tests, recovery behavior and real-hardware validation pass.

Initial fixture/compatibility baseline: **RadioMaster Pocket ELRS with EdgeTX
v2.12.4**, using stable source commit
`def35ad324896b45d6607d4778536b1bc5360d20`. This matches the supplied firmware and
Companion captures. It is not a claim that other radios or releases are
compatible. A physical-radio capture is available; matching hardware bench
verification is still required before enabling writes.

The wider roadmap includes monochrome and color radios, Companion model/radio
editing and simulation, and Buddy firmware/SD-content workflows.

## Current application boundary

At Configurator commit `9a43357`, the repository provides Vue 3, strict TypeScript,
Vite, Nuxt UI/Tailwind, a minimal App/AppShell, component-test examples, browser
smoke tests and CI. It has no EdgeTX domain model, codecs, file access,
workspaces, backup/restore, model editor or hardware transport.

Keep the existing stack and checks. Introduce routing/shared state libraries only
when actual workspace/navigation requirements justify them. Proposed feature
locations include `src/features/workspaces`, `src/features/backups`,
`src/features/models`, `src/features/updates`, `src/domain/edgetx` and
`src/services/storage`; these are future boundaries, not existing directories
or a requirement to create empty folders.

Do not infer a Betaflight-style serial configuration protocol from the choice of
UI stack. EdgeTX storage workflows and firmware flashing are separate concerns.

## Facts that shape the implementation

- The monochrome manual supports Pocket and describes model slots, backup/copy/
  move/delete, setup, inputs, mixes, outputs and radio settings. [S1-S4]
- Native configuration uses `RADIO/radio.yml` and `MODELS/model*.yml`, with
  capability-dependent label/list metadata and associated model notes. Model
  identity, slot, filename and displayed name must not be conflated. [S2, S6]
- Companion `.etx` is a ZIP-based models/settings document. It is not a full
  SD-card backup and does not capture installed MCU/RF-module firmware. [S5-S6]
- Firmware checks `radio.yml` integrity. A bad checksum can trigger recovery;
  the documented `manuallyEdited` flag is not a general-purpose safe writer. [S2, S7]
- Companion preserves radio-specific calibration on settings writes. Same radio
  type does not mean the same physical calibration. [S6]
- The inspected development Companion uses `tree.cpp`, while stable v2.12.4 uses
  `labeled.cpp`. Pin codecs/fixtures to the supported release; do not import
  development assumptions blindly. [S6, S8]
- Companion's model editor is capability-driven. Its round-trip tests also
  acknowledge unrelated non-idempotent fields: Companion serialization alone is
  not proof of whole-document byte preservation. [S9-S10]
- Buddy uses filesystem jobs for SD/sound assets and a separate WebUSB/DFU
  flashing pipeline. Its protected-directory logic is reference behavior, not a
  substitute for a reviewed merge plan that preserves custom content. [S12-S14]
- Browser directory access has limited availability, needs a secure context and
  a user gesture, and distinguishes read from read/write permission. [S15]

## Backup and restore terminology

| Operation                | Meaning and boundary                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full SD backup           | Preserve all readable files/directories from the selected SD tree, including custom content. Not installed firmware, internal storage outside that tree, or a complete device clone. |
| Configuration backup     | Preserve the selected RADIO/MODELS configuration and declared metadata. Clearly list exclusions such as sounds, scripts, images and logs; do not call it a full backup.              |
| Companion document       | Compatible `.etx` models/settings interchange, kept distinct from the Configurator backup container.                                                                                 |
| Offline restore          | Reconstruct a verified archive into a new working folder, or export it for manual extraction. No automatic radio apply.                                                              |
| Safe radio restore/apply | Preview and apply selected supported changes to the explicitly selected radio; preserve target hardware/calibration by default.                                                      |
| Exact disaster recovery  | Separate, explicit same-unit recovery mode. Never silently equate this with ordinary model transfer or settings restore.                                                             |

A proposed Configurator backup is a versioned ZIP with a manifest and a separate
payload namespace. Preserve original file bytes and relative paths; record scope,
sizes, digests and source-profile confidence. This is not a decision to add a
manifest to native `.etx` files.

## Safety and quality rules for every milestone

- Local-first: do not upload configurations, logs or backups by default. Render
  imported names/notes as data; never execute imported Lua or arbitrary content.
- Retain original bytes. No-op export must not rewrite untouched files. Edited
  files must preserve unowned/unknown fields; unsupported structures stay read-only.
- Validate schema, board capabilities, source/switch references and firmware
  checksum rules before export/apply. Reject invalid edits, not silent truncation,
  dropped fields or success-shaped defaults.
- Treat archive paths, duplicate entries, aliases, oversized content and filenames
  as untrusted. Define bounded parsing/expansion policies before shipping.
- Initial restore/apply is same-radio only. Preserve calibration and unknown
  hardware-specific fields; no automatic cross-radio conversion.
- Before a radio write, require a retained, verified backup, a reviewed diff,
  fresh target/baseline checks and explicit read/write permission.
- Browser filesystems do not provide a guaranteed all-files transaction. Report
  per-file completion, partial failure and recovery options honestly.
- Do not enable a write feature publicly until it has pinned-format tests and
  matching hardware qualification. Never auto-bind, change RF power, reset
  calibration or run firmware flashing as a side effect of opening a file.
- Extend existing Vitest tests for domain behavior and Playwright for user
  workflows. Keep ordinary CI independent of attached radios; maintain a separate
  documented hardware acceptance matrix.
- Accessibility, keyboard use, loading/cancel/error states, user-facing copy and
  README command updates are part of each feature, not final polish.

## Milestones and priorities

P0 = first useful backup/restore and safe foundations.
P1 = basic editing and qualified radio apply.
P2 = broader Companion/Buddy parity.
P3 = expansion and optional infrastructure.

| Milestone            | Work items       | Exit condition                                                                     |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| M0: foundations      | F01-F04          | Pinned fixtures, safe local access, raw workspace and proven codec boundaries      |
| M1: backup/restore   | B01-B04          | Reopen and verify a lossless backup, then reconstruct it offline                   |
| M2: basic model work | E01-E06          | Browse, edit/export and manage supported models without mutating the source        |
| M3: radio apply      | R01-R04          | Reviewed same-radio writes and recovery behavior pass hardware qualification       |
| M4: Companion parity | C01-C08, A01-A05 | Supported editor areas, diagnostics and simulation grow behind compatibility gates |
| M5: Buddy parity     | U01-U04          | Reviewed downloads, SD/sounds updates and separately qualified DFU flashing        |
| M6: expansion        | X01-X03          | Explicit additional support/migration matrix and product-readiness gates           |

Dependencies below are prerequisites, not a requirement to implement every
earlier milestone first. In particular, U01 can run alongside model editing.
Raw backup/offline restore does not depend on a fully implemented model codec.

## M0: foundations

### F01. Pin compatibility profiles and a fixture corpus

**Priority:** P0. **Depends on:** none.

**Work:** Record Pocket ELRS/v2.12.4 board, display, storage schema and RF variants.
Collect clean radio-generated configuration, Companion-generated `.etx`/model
files, representative notes and metadata. Record provenance, source commit,
expected behavior and permission/license to include fixtures; do not commit
personal logs, binding identifiers or private configurations.

**Acceptance/tests:** Normal, empty, invalid, unsupported-version and unknown-field
fixtures are reproducible. Schema version is distinguished from firmware release.
Hardware acquisition is tracked explicitly rather than assumed. [S1, S6-S10]

**Progress:** A [curated corpus](tests/fixtures/pocket-2.12.4/README.md) records the
profile, provenance, source fingerprints, sanitization and positive/negative
cases. Native checksums and immutable-file digests are automatically checked.
The sanitized Companion baseline and F04 edited candidates were manually loaded
in Companion 2.12.4; their model exports matched the qualified field expectations.
Further field coverage/interchange still requires its own validation.
These test-only settings have synthetic calibration and are not for radio deployment.

### F02. Add local file/directory adapters and capability UX

**Priority:** P0. **Depends on:** none.

**Work:** Add user-initiated file selection/download and optional directory
selection through a small storage interface with an in-memory test adapter.
Start directory access read-only. Feature-detect secure-context/API support,
permissions and cancellation; offer file/ZIP import/export fallbacks.

**Acceptance/tests:** Import/export works without a radio. Permission refusal and
unsupported browsers produce actionable states; no fake connected device or
silent fallback write. Test Chromium directory behavior and fallback workflows
on Firefox/Safari where supported. [S15]

**Progress:** Read-only storage ports, native file/directory adapters, an in-memory
adapter and the Local Files UI are implemented. Unit and cross-browser checks
cover unchanged binary download, read-mode options, unsupported browsers,
permission denial and cancellation. The native OS picker selection/cancellation
was manually confirmed. ZIP/.etx files remain opaque; directory inventory and
actual backup creation are subsequent tasks.

### F03. Introduce a raw workspace and operation navigation

**Priority:** P0. **Depends on:** F02.

**Work:** Represent the selected file tree, original bytes, source metadata,
diagnostics and operation state separately from editable domain data. Add a
workspace entry screen with inventory and backup/restore navigation. Future
archive adapters should produce the same raw workspace shape.

**Acceptance/tests:** Unknown files remain present; invalid content is visible,
not discarded. Opening/closing a workspace does not mutate its source. No
automatic persistent storage of user data or assumed radio identity.

**Progress:** Immutable RAM snapshots retain relative paths, unknown/malformed
files, empty directories, source metadata and diagnostics. Inventory is paginated,
and Backup/Restore navigation explicitly reports that archive operations are not
implemented. User-approved limits are 512 MiB total, 64 MiB/file, 20,000 entries
and 64 nested directory levels. Unreadable/over-budget entries remain visible;
entry/depth caps report unscanned regions and mark the workspace incomplete.
Cancellation preserves the previous workspace. Downloads are detached from
later source changes; content validation/radio identification remain unperformed.

### F04. Prove document-preserving YAML and capability codecs

**Priority:** P0. **Depends on:** F01.

**Work:** Evaluate a TypeScript document/CST-preserving parser and targeted writer
for the pinned native files. Preserve unknown keys and unowned sections; model
source/switch types, enum values, units and board-dependent limits explicitly.
Implement firmware-compatible radio checksum handling from emitted bytes.

**Acceptance/tests:** Untouched files retain identical bytes. Small edited fields
reload with only intended semantic changes, including edge-case strings and
line endings. Unsupported tags/aliases/schema variants remain read-only. Verify
against radio-generated fixtures and matching Companion; if parity cannot be
proven, assess codec reuse/WASM before allowing writes. [S6-S10]

**Progress:** A verification-only TypeScript scalar-range codec and pinned
field/reference rules are implemented with byte-preserving no-op export and
strict CRC handling. User-approved inspection limits are 1 MiB, 50,000 AST
nodes and 64 container levels. Automated fixture/negative/reference checks pass.
The baseline archive opens in Companion 2.12.4; edited candidate archives and
model-field comparisons are available through `npm run codec:fixtures` and
`npm run codec:compare`. Both edited candidate archives were checked in
Companion 2.12.4, and both exported models passed comparison. The displayed
`I2:Ele`/`SB-` and literal-weight checkbox state match native `I1`/`SB1` and
numeric weight 75. F04 is complete for this tested scalar subset.
No editing UI, whole-model conversion or source/radio writes are enabled.

## M1: first useful backup and offline restore

### B01. Add backup scope selection and complete inventory

**Priority:** P0. **Depends on:** F01, F03.

**Work:** Offer clearly labeled full-SD and configuration-only scopes. Inventory
files, empty directories, sizes and exclusions before export. Show source-profile
confidence and warn that installed firmware is not captured.

**Acceptance/tests:** Custom files and unreadable files cannot silently disappear
from a claimed full backup. Configuration exclusions are visible. Prevent
overwriting known source files with the output; warn that the backup must be
retained away from the radio/source tree. [S2-S3]

### B02. Export a lossless, versioned backup archive

**Priority:** P0. **Depends on:** B01.

**Work:** Implement archive/manifest serialization with original relative paths,
file sizes and SHA-256 digests. Keep manifest and payload namespaces distinct.
Evaluate streaming and finite resource limits rather than assuming every SD card
fits in browser memory.

**Acceptance/tests:** Reopening verifies every payload digest, including empty and
binary files. Unknown files and directories survive. Cancellation/download
failure is not reported as a retained backup; distinguish archive generation
from confirmed persistence. Digests provide integrity, not authenticity.

### B03. Inspect backups and preview a restore without writes

**Priority:** P0. **Depends on:** B02.

**Work:** Validate container version, manifest, paths, entries and digests before
presenting scope, source profile and restore inventory. Reject path traversal,
duplicates/case collisions, corrupt/truncated data and unsafe expansion.

**Acceptance/tests:** Inspection never requests write permission. Bad archives
cannot reach the restore stage. Unknown schema/container variants get an explicit
unsupported state; avoid treating any ZIP as a native `.etx` document.

### B04. Restore into a new offline working folder

**Priority:** P0. **Depends on:** B03, F02.

**Work:** Reconstruct verified payloads into an explicitly selected empty working
folder, or export a verified archive for manual extraction on fallback browsers.
Check conflicts before writing and verify completed files by reading them back.

**Acceptance/tests:** The restored tree matches archived bytes and directories.
Existing files are never silently overwritten. Permission loss, disconnect,
cancellation and partial write are surfaced with a recovery report. This is
offline reconstruction, not a hidden radio apply.

## M2: model browsing and small offline edits

### E01. Add a read-only model browser

**Priority:** P1. **Depends on:** F03, F04.

**Work:** List models with distinct filenames, slots/IDs, names, active-model
references and capability-dependent labels. Show setup, timer, input, mix,
output and RF summaries without changing data.

**Acceptance/tests:** Slot gaps, duplicate names, missing metadata, invalid models
and unknown fields are visible. Unsupported profiles cannot enter edit mode.
No selected file is silently assigned the current app's board profile. [S2, S6]

### E02. Add reversible draft editing, validation and change review

**Priority:** P1. **Depends on:** E01.

**Work:** Maintain an immutable original and an editable draft, dirty state,
undo/redo, reset and a semantic plus file-level change review. Separate export
from radio apply; undoing an editor change must not imply undoing a hardware write.

**Acceptance/tests:** Cancel/reset leaves original files unchanged. Navigation
warns about unsaved edits. Invalid commands cannot reach export; edit operations
are covered independently from rendering.

### E03. Deliver the first model-name edit/export slice

**Priority:** P1. **Depends on:** E02.

**Work:** Edit a model name using target-specific character/byte limits and export
the supported native model file. Preserve filename/slot, RF settings and all
unrelated data. Detect name-associated notes and warn about associations needing
review until E04 manages them.

**Acceptance/tests:** The exported model opens in matching Companion and the
pinned radio fixture path. No-op export retains original bytes; over-limit names
fail validation instead of truncating silently. [S4, S9-S10]

### E04. Add timers and model notes/checklists

**Priority:** P1. **Depends on:** E03.

**Work:** Edit supported timer names, modes, start values, triggers, persistence
and announcements with explicit units/capabilities. Add plain-text model notes
and reviewed rename associations; distinguish missing from empty notes.

**Acceptance/tests:** Timer edge cases and references round-trip correctly.
Renaming cannot overwrite another model's notes. Imported notes are not executed,
and unedited timer/RF sections remain intact. [S2, S4, S9]

### E05. Add native Companion `.etx` interchange

**Priority:** P1. **Depends on:** F04, B03, E01.

**Work:** Add a native ZIP-tree adapter for supported `.etx` documents and export
the release-compatible layout. Keep it distinct from Configurator backup
archives; inventory actual contents rather than assume all assets are included.

**Acceptance/tests:** Matching Companion can open exported documents. Unknown
members are retained where compatible, and malformed or mixed-version archives
cannot be written. No Configurator manifest is injected into native documents.
Legacy `.otx`/EEPROM conversion belongs to X02. [S5-S6]

### E06. Add model lifecycle and label/slot management

**Priority:** P1. **Depends on:** E02, E05.

**Work:** Support create-from-verified-defaults, duplicate, copy/import, move,
delete and labels where available. Track references and active-model changes
across native files. Keep deletion reversible until export/apply.

**Acceptance/tests:** Active references never point to missing models. Slot limits,
filename collisions and label ordering are validated. Duplication surfaces
receiver/model-match ID conflicts; it never auto-binds or silently changes RF
identity. [S2, S6, S9]

## M3: qualified same-radio restore and apply

### R01. Build the reviewed operation and recovery engine

**Priority:** P1. **Depends on:** B03, B04, E02.

**Work:** Generate an explicit add/change/delete plan from fresh target bytes and
baseline hashes. Add one-operation-at-a-time protection, write-ahead recovery
records, per-file completion, cancellation boundaries and verification.
Decide where recovery state/backup is durably retained before mutation.

**Acceptance/tests:** Changed baselines, permission loss, close/write errors,
quota failures and disconnects stop safely and report affected files. Recovery
does not resume against an unverified target. Do not claim all-files atomicity
or guaranteed free-space checks that browser APIs cannot provide.

### R02. Apply/restore selected models to the same radio

**Priority:** P1. **Depends on:** R01, E06.

**Work:** Require a retained, reopened-and-verified backup, supported source/target
profiles, explicit destination selection, a reviewed diff and read/write consent.
Start models-only: leave radio settings and unrelated custom content unchanged.

**Acceptance/tests:** No silent delete-all-models operation or auto-apply on open.
If an operation needs an active-model settings update, block it until R03 can
perform that supported change. Write controls stay unreleased until R04 passes.
Folder names/USB identifiers alone are not proof of a physical radio's identity.

### R03. Add protected radio-settings restore

**Priority:** P1. **Depends on:** R01, R02, F04.

**Work:** Make settings restore a separate explicit mode. Apply only supported,
reviewed fields while retaining target calibration, hardware-specific and
unowned fields. Recompute required checksums and review active-model references.

**Acceptance/tests:** Target calibration survives model/settings transfer.
Unknown hardware fields are not replaced from an archive. Missing/corrupt target
settings or unsupported versions block apply. Exact same-unit disaster recovery
is a separate X02 policy, not an implicit override. [S6-S8]

### R04. Qualify and release radio-write capabilities

**Priority:** P1. **Depends on:** R02, R03.

**Work:** Record real Pocket ELRS/v2.12.4 bench tests for supported OS/browser combinations,
model reload, settings integrity, interrupted operations and documented recovery.
Require explicit operator review with RF/model operation safely inactive.

**Acceptance/tests:** Read-back digests and observed radio behavior agree.
Calibration and unselected content remain unchanged. Public write UI is enabled
only for qualified profiles/operations, with limitations documented.

## M4: broader Companion editing and tools

### C01. Add shared source/switch/reference controls

**Priority:** P2. **Depends on:** F04, E02.

**Work:** Build capability-driven selectors and typed references for controls,
switches, channels, curves, global variables and telemetry sources.

**Acceptance/tests:** IDs, inverted switches, units, unavailable controls and
references retain correct native meaning across edits. No guessed mapping from
another board or generic global enum list. [S9]

### C02. Add Inputs editing

**Priority:** P2. **Depends on:** C01.

**Work:** Support ordered input lines, sources, weights, offsets, curves,
activation conditions and copy/insert/move/delete.

**Acceptance/tests:** Default channel order is respected, not hard-coded.
Reference updates and ordered multiline behavior match pinned firmware/Companion
fixtures; preview graphs are labeled with their supported scope. [S4, S9]

### C03. Add Mixes editing

**Priority:** P2. **Depends on:** C01, C02.

**Work:** Edit channel-assigned ordered mixes, sources, weights/offsets, trims,
switches, modes, multiplex behavior, delays and speeds.

**Acceptance/tests:** Add/multiply/replace order and copy/move/delete semantics
are covered by fixture/oracle cases. A simplified graph is not represented as
complete firmware simulation. [S4, S9]

### C04. Add Outputs editing

**Priority:** P2. **Depends on:** C01, C03.

**Work:** Edit names, limits, direction, subtrim, curves, centers and supported
extended-limit behavior with visible units and constraints.

**Acceptance/tests:** Native scaling and boundary cases round-trip without
changing unrelated channels. Flight-critical edits require additional qualified
test cases before becoming eligible for live apply. No automatic tuning or
calibration. [S4, S9]

### C05. Add Curves and Global Variables

**Priority:** P2. **Depends on:** C01, C02, C03.

**Work:** Edit supported curve types/points and global-variable values/references.
Update dependent references when changing reusable objects.

**Acceptance/tests:** Point ordering, ranges and inherited/reference values follow
firmware semantics. Unsupported variants stay read-only instead of being
normalized to an invented default. [S9]

### C06. Add Flight/Drive Modes and Heli settings

**Priority:** P2. **Depends on:** C05.

**Work:** Add capability-dependent mode switches, trim inheritance, fades, global
variable relationships and heli settings only where supported.

**Acceptance/tests:** Mode-specific values and references survive reordering and
edits. Heli UI is absent/disabled for unsupported profiles. [S9]

### C07. Add Logical Switches and Special Functions

**Priority:** P2. **Depends on:** C01, C06, E04.

**Work:** Support function-specific arguments, activation, timing and references,
including timer/audio/logging functions.

**Acceptance/tests:** Native function IDs and argument types are validated.
Dangling references are surfaced; latch/edge behavior is checked against firmware
oracles rather than generic assumptions. Imported functions never execute in
the browser. [S9]

### C08. Add RF/module, failsafe and trainer configuration

**Priority:** P2. **Depends on:** C01, C04, R04.

**Work:** Add explicitly supported internal/external module settings, channel
ranges, model-match identifiers, failsafes and trainer configuration.

**Acceptance/tests:** Hardware/RF variants drive available options. Unsupported
protocols and missing target information block writes. No automatic binding,
power changes or receiver flashing; each newly writable area is qualified. [S4, S9]

### A01. Add radio preferences and app radio profiles

**Priority:** P2. **Depends on:** R03, C01.

**Work:** Edit supported radio preferences and distinguish them from app-side
profiles and hardware calibration. Use explicit consent for retained local
profile data.

**Acceptance/tests:** Changing a profile does not convert/rewrite loaded files.
Calibration remains protected; preference defaults do not silently alter existing
models. [S6, S9]

### A02. Add telemetry configuration and local log viewing

**Priority:** P2. **Depends on:** E01, C07.

**Work:** Add supported sensor IDs, types, formulas, units and references; inspect
CSV logs locally with bounded parsing and clear source metadata.

**Acceptance/tests:** Sensor dependencies and scaling survive round-trip.
Malformed/large logs remain manageable; no implicit live telemetry transport,
cloud upload or execution of imported spreadsheet/text content.

### A03. Add display and associated asset management

**Priority:** P2. **Depends on:** E04, A02.

**Work:** Configure supported monochrome display pages and manage model images,
notes, sound references and scripts as files. Expand color widgets only through
qualified X01 profiles.

**Acceptance/tests:** Display/asset constraints come from the target, not a single
manual example. Missing assets and rename conflicts are visible. Lua is opaque
content, not code executed by the app. [S2, S9]

### A04. Investigate firmware-backed simulation

**Priority:** P2. **Depends on:** F04, E03, C03.

**Work:** Assess a browser worker/WASM integration for the matching firmware,
using Companion's simulator interfaces as behavioral references. Start with a
bounded supported model/control subset.

**Acceptance/tests:** Demonstrate input/switch-to-channel parity and lifecycle
cleanup before promising simulation. Native Qt/WAMR hosting is not assumed to
drop into a browser. No simulated outputs are transmitted to real hardware. [S11]

### A05. Add compare, print/export and guided model creation

**Priority:** P2. **Depends on:** E05, E06, C04, A04.

**Work:** Provide semantic model comparison, printable summaries and guided
creation from verified templates, while preserving unknown data.

**Acceptance/tests:** Reports reflect stored units/references accurately.
Templates produce firmware-valid reviewed models and expose unsupported areas;
they do not hide RF/failsafe choices behind guessed defaults. [S9]

## M5: Buddy-equivalent update workflows

### U01. Add version/target catalog and reviewed downloads

**Priority:** P2. **Depends on:** F01, F02.

**Work:** Read official release/target metadata, offer stable selections and
explicitly chosen local artifacts, and download compatible firmware/SD assets.
Validate CORS/API behavior before adding any minimal proxy/backend.

**Acceptance/tests:** Unknown targets, unavailable releases and download errors
are explicit. Never infer a board solely from a common STM32 USB ID or filename.
Separate computed integrity checks from vendor authenticity claims. No automatic
updates. This work can run alongside M2. [S12-S14]

### U02. Add reviewed SD-card and sound-pack updates

**Priority:** P2. **Depends on:** U01, R01, R04, B02.

**Work:** Plan official asset changes and selected languages against current
content, then execute through verified file jobs. Preserve RADIO/MODELS and
custom scripts/sounds/images by default; review conflicts and metadata updates.

**Acceptance/tests:** Updates do not erase custom content or treat a config-only
backup as a full-SD rollback. Cancellation/failure preserves a usable recovery
record. Factory-clean behavior requires a separate explicit policy. [S3, S12]

### U03. Add separately qualified WebUSB/DFU flashing

**Priority:** P2. **Depends on:** U01, R04, B02.

**Work:** Implement a dedicated permission/mode-selection, artifact review and
flashing pipeline for the first supported hardware target. Provide download/
bootloader instructions where browser/device/driver support is unavailable.

**Acceptance/tests:** Wrong/missing target information blocks flashing; partial
erase/write and disconnects have explicit recovery guidance. Backups and warnings
precede mutation. DFU is not used as a substitute for SD model-file access.
Bootloader/RF-module/receiver updates need separate qualification, not automatic
extension of the first radio-flashing path. [S3, S13-S14]

### U04. Add optional custom/cloud build support

**Priority:** P3. **Depends on:** U01.

**Work:** If the official build service remains suitable, add supported build
options, job progress and reviewed artifact downloads. Evaluate API contracts,
authentication, CORS, rate limits and service failure modes first.

**Acceptance/tests:** No embedded private tokens or automatic cloud upload of user
models. Download-only use remains separate from U03 flashing. Do not copy Buddy's
Electron/GraphQL architecture simply because it exists. [S13-S14]

## M6: expansion and product readiness

### X01. Expand the qualified board/display matrix

**Priority:** P3. **Depends on:** F01, F04, R04, C01.

**Work:** Add a second monochrome radio with different controls, then 212x64 and
color profiles. Cover storage/control/display variations and RF variants with
their own fixtures and hardware qualification.

**Acceptance/tests:** Capabilities and writer support are explicit per profile.
Raw backup remains available independently of editor support; unsupported radios
never inherit Pocket's limits or settings mappings. [S1, S9]

### X02. Add explicit migration, legacy import and disaster recovery

**Priority:** P3. **Depends on:** X01, E05, R03.

**Work:** Define supported source-to-target firmware/schema conversions and
legacy Companion/OpenTX imports as separate adapters. Preserve originals and
show conversion loss/mapping previews. Specify exact same-unit recovery as a
separate non-default operation.

**Acceptance/tests:** No silent cross-version/board conversion or calibration
cloning. Legacy binaries are not guessed from arbitrary bytes. Unsupported
fields and lossy changes require review; exact recovery verifies the physical
unit/version and explicitly explains calibration replacement. [S6, S8]

### X03. Harden supported workflows for product release

**Priority:** P2, ongoing. **Depends on:** F03, R04, U02.

**Work:** Complete localization/onboarding, accessibility, large-data performance,
privacy/retention controls, support diagnostics and the OS/browser test matrix.
Assess PWA/offline deployment or native fallback only against demonstrated
requirements; do not assume a desktop wrapper is necessary.

**Acceptance/tests:** The published support matrix describes real limitations
and excludes unfinished features. Documentation, recovery instructions,
fixture provenance and CI remain current; no silent telemetry or data retention.

## Definition of done for an implementation item

- Its prerequisites and supported profile are explicit.
- The smallest complete user workflow works, including cancellation/errors.
- Relevant raw data and unedited fields are preserved.
- Domain tests and browser workflow tests cover introduced behavior and failures.
- Format, lint, type, unit and smoke checks pass using the existing tooling.
- Radio-write areas additionally have a recorded hardware qualification.
- Documentation and support limitations are updated; no planned feature is
  advertised as implemented solely because its UI exists.

## Research references

Manual pages are UX references for the v2.12 manual. Storage truth and fixture
expectations must come from the pinned supported firmware/Companion release.
The development checkout was examined at
`54df93de52a87f18bd77273ac0f31438a03d82d4`; Buddy at
`66401b2fcec2c31976930c982c220820b1cee7f8`.

- **S1:** [Monochrome radio manual and supported models](https://manual.edgetx.org/bw-radios).
- **S2:** [Model Select](https://manual.edgetx.org/bw-radios/model-select) and [SD-card layout](https://manual.edgetx.org/bw-radios/radio-settings/sd-card).
- **S3:** [Update/backup procedure and SD preservation](https://manual.edgetx.org/installing-and-updating-edgetx/update-from-opentx-to-edgetx-1).
- **S4:** [Model Setup](https://manual.edgetx.org/bw-radios/model-select/setup), [control flow](https://manual.edgetx.org/bw-radios/model-select/inputs-mixes-and-outputs), [Inputs](https://manual.edgetx.org/bw-radios/model-select/inputs-mixes-and-outputs/inputs), [Mixes](https://manual.edgetx.org/bw-radios/model-select/inputs-mixes-and-outputs/mixes), [Outputs](https://manual.edgetx.org/bw-radios/model-select/inputs-mixes-and-outputs/outputs).
- **S5:** [Stable `.etx` ZIP reader/writer](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/companion/src/storage/etx.cpp).
- **S6:** [Stable models/settings tree and calibration preservation](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/companion/src/storage/labeled.cpp) and [SD storage adapter](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/companion/src/storage/sdcard.cpp).
- **S7:** [Stable firmware YAML/checksum recovery](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/radio/src/storage/sdcard_yaml.cpp) and [hardware settings](https://manual.edgetx.org/bw-radios/radio-settings/hardware).
- **S8:** [Development storage dispatch](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/storage/storage.cpp), [tree writes](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/storage/tree.cpp), [single-YAML import](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/storage/yaml.cpp).
- **S9:** [Companion editor panels/capability gates](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/modeledit/modeledit.cpp), [setup](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/modeledit/setup.cpp), [model/tool actions](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/mainwindow.cpp).
- **S10:** [Companion model round-trip tests and caveats](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/tests/model_yaml_roundtrip_test.cpp).
- **S11:** [Native Companion WASM simulator interface](https://github.com/EdgeTX/edgetx/blob/54df93de52a87f18bd77273ac0f31438a03d82d4/companion/src/simulation/wasmsimulatorinterface.h).
- **S12:** [Buddy SD jobs/protected directories](https://github.com/EdgeTX/buddy/blob/66401b2fcec2c31976930c982c220820b1cee7f8/src/shared/backend/services/sdcardJobs.ts) and [SD asset manifests](https://github.com/EdgeTX/buddy/blob/66401b2fcec2c31976930c982c220820b1cee7f8/src/shared/backend/services/sdcardAssets.ts).
- **S13:** [Buddy flashing/build job stages](https://github.com/EdgeTX/buddy/blob/66401b2fcec2c31976930c982c220820b1cee7f8/src/shared/backend/services/flashJobs.ts).
- **S14:** [Buddy firmware catalog/downloads](https://github.com/EdgeTX/buddy/blob/66401b2fcec2c31976930c982c220820b1cee7f8/src/shared/backend/services/firmwareStore.ts) and [browser capability checks](https://github.com/EdgeTX/buddy/blob/66401b2fcec2c31976930c982c220820b1cee7f8/src/renderer/compatibility/checks.ts).
- **S15:** [Directory API permissions, support and secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker).
- **Release baseline:** [EdgeTX v2.12.4](https://github.com/EdgeTX/edgetx/releases/tag/v2.12.4), pinned to the supplied Pocket ELRS firmware and Companion captures; add release support through explicit fixture and compatibility work.
