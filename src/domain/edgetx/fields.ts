import { POCKET_2_12_4 as profile } from "./profile";
import { decodeSourceReference, decodeSwitchReference } from "./references";
import type { SourceReference, SwitchReference } from "./references";

export type NativePath = readonly (string | number)[];
export type NativeKind = "model" | "radio" | "unknown";
export type NativeField =
    | { readonly kind: "text" | "enum"; readonly value: string; readonly unit: string }
    | { readonly kind: "integer"; readonly value: number; readonly unit: string }
    | { readonly kind: "source"; readonly value: SourceReference; readonly unit: "native-source" }
    | { readonly kind: "switch"; readonly value: SwitchReference; readonly unit: "native-switch" }
    | { readonly kind: "percent"; readonly value: number | SourceReference; readonly unit: "percent" }
    | {
          readonly kind: "flight-mode-mask";
          readonly value: string;
          readonly disabledModesZeroBased: readonly number[];
          readonly unit: "disabled-flight-mode-bits";
      };

type Rule =
    | { kind: "text"; max: number }
    | { kind: "integer"; min: number; max: number; unit: string }
    | { kind: "enum"; values: readonly string[] }
    | { kind: "percent"; magnitude: number }
    | { kind: "source" | "switch" | "flight-mode-mask" };

export class NativeCodecError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly path: NativePath = [],
    ) {
        super(message);
        this.name = "NativeCodecError";
    }
}

function index(part: string | number | undefined, max: number) {
    const text = String(part);
    return /^(0|[1-9]\d*)$/.test(text) && Number(text) < max;
}

export function fieldRule(kind: NativeKind, path: NativePath): Rule | undefined {
    if (kind === "radio" && path.length === 1 && path[0] === "speakerVolume") {
        return {
            kind: "integer",
            min: profile.speakerVolumeMin,
            max: profile.speakerVolumeMax,
            unit: "signed-volume-steps",
        };
    }
    if (kind !== "model") return undefined;
    if (path.length === 2 && path[0] === "header" && path[1] === "name") {
        return { kind: "text", max: profile.modelNameLength };
    }
    if (path.length !== 3) return undefined;
    const [container, row, field] = path;
    if (container === "timers" && index(row, profile.timerCount)) {
        if (field === "name") return { kind: "text", max: profile.timerNameLength };
        if (field === "start") return { kind: "integer", min: 0, max: profile.timerStartMaxSeconds, unit: "seconds" };
        if (field === "mode") return { kind: "enum", values: ["OFF", "ON", "START", "THR", "THR_REL", "THR_START"] };
        if (field === "swtch") return { kind: "switch" };
    }
    if (
        (container === "mixData" && index(row, profile.mixCount)) ||
        (container === "expoData" && index(row, profile.inputLineCount))
    ) {
        if (field === "srcRaw") return { kind: "source" };
        if (field === "swtch") return { kind: "switch" };
        if (field === "weight" || field === "offset") {
            return {
                kind: "percent",
                magnitude: container === "mixData" ? profile.mixPercentMagnitude : profile.inputPercentMagnitude,
            };
        }
        if (field === "flightModes") return { kind: "flight-mode-mask" };
        if (container === "mixData" && field === "mltpx") return { kind: "enum", values: ["ADD", "MUL", "REPL"] };
        if (container === "mixData" && field === "destCh") {
            return { kind: "integer", min: 0, max: profile.outputCount - 1, unit: "zero-based-output-channel" };
        }
        if (container === "expoData" && field === "chn") {
            return { kind: "integer", min: 0, max: profile.inputCount - 1, unit: "zero-based-input" };
        }
    }
    return undefined;
}

export function decodeField(rule: Rule, raw: string, path: NativePath): NativeField {
    function invalid(reason: string): never {
        throw new NativeCodecError("unsupported-value", reason, path);
    }
    if (rule.kind === "text") {
        if (raw.length > rule.max || !/^[ A-Za-z0-9_,.-]*$/.test(raw)) {
            invalid(`Text must fit ${rule.max} monochrome-radio characters without truncation.`);
        }
        return Object.freeze({ kind: "text", value: raw, unit: "characters" });
    }
    if (rule.kind === "integer") {
        const value = Number(raw);
        if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || value < rule.min || value > rule.max) {
            invalid(`Expected an integer from ${rule.min} to ${rule.max} (${rule.unit}).`);
        }
        return Object.freeze({ kind: "integer", value, unit: rule.unit });
    }
    if (rule.kind === "enum") {
        if (!rule.values.includes(raw)) invalid("Native enum value is not qualified for this field.");
        return Object.freeze({ kind: "enum", value: raw, unit: "native-enum" });
    }
    if (rule.kind === "flight-mode-mask") {
        if (raw.length !== profile.flightModeCount || !/^[01]+$/.test(raw)) {
            invalid(`Flight-mode masks require ${profile.flightModeCount} ordered binary characters.`);
        }
        return Object.freeze({
            kind: "flight-mode-mask",
            value: raw,
            disabledModesZeroBased: Object.freeze([...raw].flatMap((bit, i) => (bit === "1" ? [i] : []))),
            unit: "disabled-flight-mode-bits",
        });
    }
    if (rule.kind === "switch") {
        const value = decodeSwitchReference(raw);
        if (value.kind === "unknown") invalid(value.reason);
        return Object.freeze({ kind: "switch", value, unit: "native-switch" });
    }
    if (rule.kind === "percent" && /^-?\d+$/.test(raw)) {
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || Math.abs(value) > rule.magnitude) {
            invalid(`Percent values must be within +/-${rule.magnitude}.`);
        }
        return Object.freeze({ kind: "percent", value, unit: "percent" });
    }
    const value = decodeSourceReference(raw);
    if (value.kind === "unknown") invalid(value.reason);
    return rule.kind === "percent"
        ? Object.freeze({ kind: "percent", value, unit: "percent" })
        : Object.freeze({ kind: "source", value, unit: "native-source" });
}

export function encodeField(rule: Rule, value: string | number, path: NativePath) {
    const numeric = rule.kind === "integer" || (rule.kind === "percent" && typeof value === "number");
    if ((numeric && typeof value !== "number") || (!numeric && typeof value !== "string")) {
        throw new NativeCodecError(
            "invalid-edit-type",
            "The edit has the wrong scalar type for its native field.",
            path,
        );
    }
    if (rule.kind === "percent" && typeof value === "string" && /^-?\d+$/.test(value)) {
        throw new NativeCodecError(
            "invalid-edit-type",
            "Use a number for a literal percent, or a native source reference.",
            path,
        );
    }
    const decoded = decodeField(rule, String(value), path);
    return {
        decoded,
        token: typeof value === "number" ? String(value) : JSON.stringify(value),
    };
}
