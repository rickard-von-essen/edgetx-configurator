# Pocket ELRS / EdgeTX v2.12.4 fixtures

These are reviewed, minimized **test-only derivatives**, not deployment-ready
radio settings. Never restore them onto a radio: calibration is synthetic.

## Compatibility profile

`profile.json` pins Pocket ELRS, firmware/Companion v2.12.4 and EdgeTX source
commit `def35ad324896b45d6607d4778536b1bc5360d20`. The native files expose a
`semver` field; it is not an independently discovered numeric schema revision.
The fixture manifest's version is our corpus format, not an EdgeTX schema number.

The Pocket has a 128x64 monochrome display and the captured ELRS radio uses
`TYPE_CROSSFIRE`. Other Pocket RF variants are not covered. The maintainer
provided a physical-radio capture and matching Companion export; post-curation
Companion/radio verification and radio-write qualification remain pending.

Source references:

- [Pocket target and CPU](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/radio/src/targets/taranis/CMakeLists.txt)
- [Display capabilities](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/companion/src/firmwares/boards.cpp)
- [Native checksum validation](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/radio/src/storage/sdcard_yaml.cpp)
- [Companion checksum writer](https://github.com/EdgeTX/edgetx/blob/def35ad324896b45d6607d4778536b1bc5360d20/companion/src/firmwares/edgetx/edgetxinterface.cpp)

## Provenance and sanitization

The maintainer supplied radio-generated YAML and a Companion `.etx` export
with matching v2.12.4 provenance, and authorized committing necessary reviewed
derivatives. These fixtures are included under the repository's GPL-2.0 license.
`manifest.json` records private-input fingerprints and curated-file digests.
Private inputs themselves are not published.

- Keep only the generic Trainer model (`model07.yml`), in both radio-written and
  Companion-written forms. Other models, telemetry/log files, scripts, sounds,
  images, OS metadata and trash are excluded.
- Clear owner/model registration IDs.
- Replace all five controls' calibration midpoint/spans with the same synthetic
  value, `1024`, and reset accumulated usage time to zero.
- Set the active-model slot to `7`, matching the retained model.
- Recompute settings checksums using CRC-16/CCITT, polynomial `0x1021`, initial
  value `0xffff`, over the exact bytes after the checksum line. Both private
  originals passed this calculation before any modifications.
- Preserve remaining native bytes and line endings. The radio captures use
  CRLF, while Companion uses LF; neither is reformatted.
- Rebuild the `.etx` with only its sanitized settings and Trainer model. Fixed ZIP
  timestamps, stored entries and no source metadata make it reproducible.
  This archive is Companion-derived, not an untouched Companion export.

`companion/MODELS/model07.yml` is extracted from the corresponding Companion
archive member. The separate supplied model export represented another model
and is deliberately excluded from this minimal corpus.

## Cases

| Path                            | Expected use                                                            |
| ------------------------------- | ----------------------------------------------------------------------- |
| `native/`                       | Radio-written layout/line endings after documented sanitization         |
| `companion/`                    | Companion-written layout and native `.etx` container after sanitization |
| `cases/empty.yml`               | Empty-document diagnostic                                               |
| `cases/invalid.yml`             | YAML syntax-error diagnostic                                            |
| `cases/unsupported-version.yml` | Explicitly synthetic unsupported version                                |
| `cases/unknown-field.yml`       | Retain an added, unowned field without data loss                        |
| `cases/checksum-mismatch.yml`   | Nonzero incorrect checksum; never bypass as legacy zero-checksum data   |

These expected outcomes guide F04; they do not imply a YAML codec already exists.
No-op round-trip tests must compare bytes. Do not format these YAML snapshots.
`.gitattributes` disables newline conversion for the snapshots and archive, so
their checksums and manifest digests remain stable on Windows as well.

## Reproduction

Fixture preparation optionally uses **Python 3's standard library**; application
development and normal npm checks do not require Python.

From the repository root, with the original private input folder available:

```sh
python3 tests/fixtures/pocket-2.12.4/prepare.py tests/data/pocket-fixtures
python3 tests/fixtures/pocket-2.12.4/prepare.py tests/data/pocket-fixtures --check
```

The preparation script reads only the named native files, archive members and
provenance. It never writes to the private inputs. Inputs can instead be supplied
from a private directory outside the repository.

The raw `tests/data/pocket-fixtures/` directory is excluded from Git and Prettier.
After retaining a private backup elsewhere, the **entire raw input directory can
be removed from this repository**. Keep this curated fixture directory.
