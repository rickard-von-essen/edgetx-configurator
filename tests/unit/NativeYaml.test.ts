import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crc16Ccitt, inspectRadioChecksum, replaceRadioChecksum } from "../../src/domain/edgetx/checksum";
import { inspectNativeYaml, NATIVE_YAML_LIMITS } from "../../src/domain/edgetx/nativeYaml";
import { POCKET_2_12_4 as profile } from "../../src/domain/edgetx/profile";

const target = { profileId: profile.id };
const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const equalBytes = (a: Uint8Array, b: Uint8Array) => expect(Array.from(a)).toEqual(Array.from(b));
const minimal = "semver: 2.12.4\nheader:\n  name: Trainer\n";

function fixture(path: string) {
    return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/pocket-2.12.4", path));
}

describe("native YAML byte preservation", () => {
    it.each([
        "native/MODELS/model07.yml",
        "companion/MODELS/model07.yml",
        "native/RADIO/radio.yml",
        "companion/RADIO/radio.yml",
        "cases/unknown-field.yml",
    ])("exports %s byte-identically without whole-document serialization", (path) => {
        const original = fixture(path);
        const document = inspectNativeYaml(original, target);

        expect(document.diagnostics).toEqual([]);
        expect(document.mode).toBe("verification-only");
        expect(document.radioWritesQualified).toBe(false);
        equalBytes(document.originalBytes(), original);
        equalBytes(document.companionVerificationCandidate([]), original);
    });

    it("owns its original bytes rather than retaining a mutable Buffer view", () => {
        const input = fixture("native/MODELS/model07.yml");
        const before = Buffer.from(input);
        const document = inspectNativeYaml(input, target);
        input.fill(0);
        const exported = document.originalBytes();
        exported.fill(0);

        equalBytes(document.originalBytes(), before);
    });

    it.each(["native/MODELS/model07.yml", "companion/MODELS/model07.yml"])(
        "changes only the existing name scalar in %s",
        (path) => {
            const original = fixture(path);
            const document = inspectNativeYaml(original, target);
            const candidate = document.companionVerificationCandidate([
                { path: ["header", "name"], value: "CodecTest" },
            ]);
            const expected = encode(
                decode(original).replace(/(^[ \t]+name: )(?:"Trainer"|Trainer)(\r?)$/m, '$1"CodecTest"$2'),
            );

            equalBytes(candidate, expected);
            expect(inspectNativeYaml(candidate, target).scalarText(["header", "name"])).toBe("CodecTest");
            equalBytes(document.originalBytes(), original);
        },
    );

    it("preserves comments, Unicode, leading-zero masks, block strings and CRLF outside the edited scalar", () => {
        const originalText =
            "# café 🚀\r\nfuture:\r\n  value: 000000000\r\n  note: |-\r\n    leave this 🚀 alone\r\n" +
            minimal.replaceAll("\n", "\r\n").replace("name: Trainer", "name: Trainer # keep this comment");
        const document = inspectNativeYaml(encode(originalText), target);
        const candidate = document.companionVerificationCandidate([{ path: ["header", "name"], value: "Test" }]);

        equalBytes(candidate, encode(originalText.replace("Trainer #", '"Test" #')));
        expect(document.scalarText(["future", "value"])).toBe("000000000");
        expect(() =>
            document.companionVerificationCandidate([{ path: ["future", "value"], value: "changed" }]),
        ).toThrow("not owned");
    });

    it("retains the original representation for semantically unchanged edits", () => {
        const original = encode(minimal + "mixData:\n  - weight: 0100\n    flightModes: 000000000\n");
        const document = inspectNativeYaml(original, target);
        equalBytes(
            document.companionVerificationCandidate([
                { path: ["header", "name"], value: "Trainer" },
                { path: ["mixData", 0, "weight"], value: 100 },
                { path: ["mixData", 0, "flightModes"], value: "000000000" },
            ]),
            original,
        );
    });

    it("applies multiple scalar ranges without shifting later edits or reformatting unowned data", () => {
        const original = fixture("companion/MODELS/model07.yml");
        const document = inspectNativeYaml(original, target);
        const candidate = document.companionVerificationCandidate([
            { path: ["header", "name"], value: "Test" },
            { path: ["mixData", 0, "weight"], value: 75 },
            { path: ["mixData", 0, "srcRaw"], value: "I1" },
        ]);
        const expected = decode(original)
            .replace("  name: Trainer\n", '  name: "Test"\n')
            .replace("    weight: 100\n", "    weight: 75\n")
            .replace("    srcRaw: I0\n", '    srcRaw: "I1"\n');
        equalBytes(candidate, encode(expected));
        expect(inspectNativeYaml(candidate, target).field(["mixData", 0, "weight"])).toMatchObject({
            kind: "percent",
            value: 75,
        });
    });
});

describe("native qualification and explicit read-only outcomes", () => {
    it.each([
        ["cases/empty.yml", "empty-document"],
        ["cases/invalid.yml", "invalid-yaml"],
        ["cases/unsupported-version.yml", "unsupported-version"],
        ["cases/checksum-mismatch.yml", "checksum-mismatch"],
    ])("keeps %s read-only with its original bytes", (path, code) => {
        const original = fixture(path);
        const document = inspectNativeYaml(original, target);
        expect(document.mode).toBe("read-only");
        expect(document.diagnostics[0]?.code).toBe(code);
        equalBytes(document.originalBytes(), original);
        expect(() => document.companionVerificationCandidate([{ path: ["header", "name"], value: "Test" }])).toThrow(
            "Unsupported documents",
        );
    });

    it.each([
        minimal + "future: &value [1, 2]\nother: *value\n",
        minimal + "future: !unregistered value\n",
        minimal + "future: !!str value\n",
        minimal + "future: { <<: { x: 1 } }\n",
        minimal + "future: first\nfuture: second\n",
        "%YAML 1.1\n---\n" + minimal,
        "---\n" + minimal,
        minimal + "timers: [{ name: Tst }]\n",
        minimal + "timers:\n  00: { name: Tst }\n",
        minimal + "mixData: { 0: { weight: 100 } }\n",
        minimal.replace("name: Trainer", "name: null"),
    ])("does not enable candidates for ambiguous/unsupported YAML structure %#", (text) => {
        const original = encode(text);
        const document = inspectNativeYaml(original, target);
        expect(document.mode).toBe("read-only");
        expect(document.diagnostics).not.toEqual([]);
        equalBytes(document.originalBytes(), original);
    });

    it("requires explicit model target context and rejects a different radio board", () => {
        expect(inspectNativeYaml(fixture("native/MODELS/model07.yml")).diagnostics[0]?.code).toBe(
            "target-profile-required",
        );
        const wrongBoard = replaceRadioChecksum(
            encode(decode(fixture("native/RADIO/radio.yml")).replace("board: pocket", "board: zorro")),
        );
        expect(inspectNativeYaml(wrongBoard, target).diagnostics[0]?.code).toBe("unsupported-board");
        const wrongModule = replaceRadioChecksum(
            encode(
                decode(fixture("native/RADIO/radio.yml")).replace(
                    "internalModule: TYPE_CROSSFIRE",
                    "internalModule: TYPE_MULTIMODULE",
                ),
            ),
        );
        expect(inspectNativeYaml(wrongModule, target).diagnostics[0]?.code).toBe("unsupported-rf-configuration");
    });

    it("retains invalid UTF-8/BOM bytes without guessing an encoding or normalizing them", () => {
        const invalid = new Uint8Array([255, 0, 128]);
        const document = inspectNativeYaml(invalid, target);
        expect(document.diagnostics[0]?.code).toBe("invalid-encoding");
        equalBytes(document.originalBytes(), invalid);
        const bom = new Uint8Array([239, 187, 191, ...encode(minimal)]);
        expect(inspectNativeYaml(bom, target).diagnostics[0]?.code).toBe("unsupported-bom");
        equalBytes(inspectNativeYaml(bom, target).originalBytes(), bom);
    });

    it("does not interpret a dotted unowned key as an owned nested path", () => {
        const document = inspectNativeYaml(encode(minimal + '"header.name": keep\n'), target);
        expect(document.mode).toBe("verification-only");
        expect(() => document.companionVerificationCandidate([{ path: ["header.name"], value: "Test" }])).toThrow(
            "not owned",
        );
    });

    it("enforces byte/node/depth limits without losing the source", () => {
        const oversized = new Uint8Array(NATIVE_YAML_LIMITS.bytes + 1);
        expect(inspectNativeYaml(oversized, target).diagnostics[0]?.code).toBe("byte-limit");
        const nodes = encode(minimal + "future:\n" + Array.from({ length: 25_000 }, (_, i) => `  k${i}: x\n`).join(""));
        expect(inspectNativeYaml(nodes, target).diagnostics[0]?.code).toBe("node-limit");
        const nested = encode(minimal + "future: " + "[".repeat(64) + "x" + "]".repeat(64) + "\n");
        const document = inspectNativeYaml(nested, target);
        expect(document.diagnostics[0]?.code).toBe("depth-limit");
        equalBytes(document.originalBytes(), nested);
    });
});

describe("typed native fields and edits", () => {
    it("uses explicit native units, ordered disabled-mode bits and source index bases", () => {
        const text =
            minimal +
            "timers:\n  0:\n    mode: ON\n    name: Tst\n    start: 30\n    swtch: NONE\n" +
            "mixData:\n  - destCh: 0\n    srcRaw: I1\n    weight: gv(0)\n    swtch: SB1\n    mltpx: MUL\n    flightModes: 100000001\n";
        const document = inspectNativeYaml(encode(text), target);
        expect(document.diagnostics).toEqual([]);
        expect(document.field(["timers", 0, "start"])).toMatchObject({ kind: "integer", value: 30, unit: "seconds" });
        expect(document.field(["mixData", 0, "srcRaw"])).toMatchObject({ value: { kind: "input", indexZeroBased: 1 } });
        expect(document.field(["mixData", 0, "weight"])).toMatchObject({
            kind: "percent",
            value: { kind: "global-variable", indexZeroBased: 0 },
        });
        expect(document.field(["mixData", 0, "swtch"])).toMatchObject({
            value: { kind: "physical-switch", control: "SB", positionZeroBased: 1 },
        });
        expect(document.field(["mixData", 0, "flightModes"])).toMatchObject({
            value: "100000001",
            disabledModesZeroBased: [0, 8],
        });
        const candidate = document.companionVerificationCandidate([
            { path: ["timers", 0, "start"], value: 60 },
            { path: ["mixData", 0, "mltpx"], value: "REPL" },
        ]);
        expect(inspectNativeYaml(candidate, target).field(["timers", "0", "start"])).toMatchObject({ value: 60 });
    });

    it.each([
        [["header", "name"], "TooLongModel"],
        [["header", "name"], "café"],
        [["header", "name"], "bad\nname"],
        [["header", "name"], 7],
        [["mixData", 0, "weight"], 501],
        [["mixData", 0, "weight"], "100"],
        [["mixData", 0, "srcRaw"], "I32"],
        [["mixData", 0, "swtch"], "SA1"],
        [["mixData", 0, "flightModes"], "0"],
        [["mixData", 0, "mltpx"], "REPLACE"],
    ] as const)("rejects an invalid edit %# instead of coercing or truncating", (path, value) => {
        const document = inspectNativeYaml(fixture("companion/MODELS/model07.yml"), target);
        expect(() => document.companionVerificationCandidate([{ path, value }])).toThrow();
    });

    it("does not insert missing fields, repeat edits, or expose unowned radio fields", () => {
        const model = inspectNativeYaml(fixture("native/MODELS/model07.yml"), target);
        expect(() => model.companionVerificationCandidate([{ path: ["timers", 0, "start"], value: 60 }])).toThrow(
            "existing scalar",
        );
        expect(() =>
            model.companionVerificationCandidate([
                { path: ["header", "name"], value: "Test" },
                { path: ["header", "name"], value: "Other" },
            ]),
        ).toThrow("only once");
        const radio = inspectNativeYaml(fixture("native/RADIO/radio.yml"), target);
        expect(() => radio.companionVerificationCandidate([{ path: ["calib", "LH", "mid"], value: 999 }])).toThrow(
            "not owned",
        );
        expect(() => radio.companionVerificationCandidate([{ path: ["manuallyEdited"], value: 1 }])).toThrow(
            "not owned",
        );
        expect(() => radio.companionVerificationCandidate([{ path: ["speakerVolume"], value: 12 }])).toThrow();
    });

    it("keeps input percentages distinct from the larger mix percentage range", () => {
        const document = inspectNativeYaml(
            encode(minimal + "expoData:\n  - weight: 100\nmixData:\n  - weight: 100\n"),
            target,
        );
        expect(() =>
            document.companionVerificationCandidate([{ path: ["expoData", 0, "weight"], value: 101 }]),
        ).toThrow();
        const candidate = document.companionVerificationCandidate([{ path: ["mixData", 0, "weight"], value: 500 }]);
        expect(inspectNativeYaml(candidate, target).field(["mixData", 0, "weight"])).toMatchObject({ value: 500 });
    });
});

describe("native radio checksum handling", () => {
    it("agrees with the standard vector and the pinned fixture checksums", () => {
        expect(crc16Ccitt(encode("123456789"))).toBe(0x29b1);
        for (const path of ["native/RADIO/radio.yml", "companion/RADIO/radio.yml"]) {
            const info = inspectRadioChecksum(fixture(path));
            expect(info?.computed).toBe(info?.declared);
        }
    });

    it.each(["native/RADIO/radio.yml", "companion/RADIO/radio.yml"])(
        "updates only speakerVolume and checksum digits in %s",
        (path) => {
            const original = fixture(path);
            const document = inspectNativeYaml(original, target);
            expect(document.field(["speakerVolume"])).toMatchObject({ value: 3, unit: "signed-volume-steps" });
            equalBytes(document.companionVerificationCandidate([{ path: ["speakerVolume"], value: 3 }]), original);
            const candidate = document.companionVerificationCandidate([{ path: ["speakerVolume"], value: 4 }]);
            const before = inspectRadioChecksum(original);
            const after = inspectRadioChecksum(candidate);
            expect(after?.declared).toBe(after?.computed);
            expect(after?.prefix).toBe(before?.prefix);
            expect(after?.ending).toBe(before?.ending);
            const body = decode(original)
                .slice(decode(original).indexOf("\n") + 1)
                .replace("speakerVolume: 3", "speakerVolume: 4");
            expect(decode(candidate).slice(decode(candidate).indexOf("\n") + 1)).toBe(body);
            expect(inspectNativeYaml(candidate, target).scalarText(["calib", "LH", "mid"])).toBe("1024");
        },
    );

    it("does not accept zero-checksum or manuallyEdited as an integrity bypass", () => {
        const original = decode(fixture("native/RADIO/radio.yml"));
        const zero = encode(original.replace(/^checksum: \d+/, "checksum: 0"));
        expect(inspectNativeYaml(zero, target).diagnostics[0]?.code).toBe("checksum-mismatch");
        const marker = replaceRadioChecksum(encode(original.replace("manuallyEdited: 0", "manuallyEdited: 1")));
        expect(inspectNativeYaml(marker, target).diagnostics[0]?.code).toBe("manual-edit-marker");
        const bom = new Uint8Array([239, 187, 191, ...fixture("native/RADIO/radio.yml")]);
        expect(inspectRadioChecksum(bom)).toBeUndefined();
    });
});
