import { describe, expect, it } from "vitest";
import { decodeSourceReference, decodeSwitchReference } from "../../src/domain/edgetx/references";

describe("native source and switch references", () => {
    it.each([
        ["I0", { kind: "input", indexZeroBased: 0, inverted: false }],
        ["!I31", { kind: "input", indexZeroBased: 31, inverted: true }],
        ["ch(31)", { kind: "channel", indexZeroBased: 31 }],
        ["tr(15)", { kind: "trainer-channel", indexZeroBased: 15 }],
        ["gv(8)", { kind: "global-variable", indexZeroBased: 8 }],
        ["ls(64)", { kind: "logical-switch-source", numberOneBased: 64 }],
        ["!P1", { kind: "control", control: "P1", inverted: true }],
        ["SA", { kind: "switch-source", control: "SA" }],
        ["MIN", { kind: "constant", percent: -100 }],
    ])("decodes source %s without confusing native index bases", (raw, expected) => {
        expect(decodeSourceReference(String(raw))).toMatchObject(expected);
    });

    it.each(["I32", "I1junk", "I01", "ch(32)", "tr(16)", "gv(9)", "ls(0)", "!NONE", "future-value"])(
        "retains unsupported source %s explicitly rather than defaulting to NONE",
        (raw) => expect(decodeSourceReference(raw)).toMatchObject({ kind: "unknown", raw }),
    );

    it.each([
        ["SB1", { kind: "physical-switch", control: "SB", positionZeroBased: 1, inverted: false }],
        ["!SA2", { kind: "physical-switch", control: "SA", positionZeroBased: 2, inverted: true }],
        ["\\!SB0", { kind: "physical-switch", control: "SB", positionZeroBased: 0, inverted: true }],
        ["L64", { kind: "logical-switch", numberOneBased: 64 }],
        ["FM8", { kind: "flight-mode", indexZeroBased: 8 }],
    ])("decodes switch %s with explicit position/mode semantics", (raw, expected) => {
        expect(decodeSwitchReference(String(raw))).toMatchObject(expected);
    });

    it.each(["SA1", "SB3", "L0", "L65", "FM9", "SW1", "NONE-extra"])(
        "retains unsupported switch %s for read-only inspection",
        (raw) => expect(decodeSwitchReference(raw)).toMatchObject({ kind: "unknown", raw }),
    );
});
