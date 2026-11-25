import { POCKET_2_12_4 as profile } from "./profile";

type UnknownReference = { readonly kind: "unknown"; readonly raw: string; readonly reason: string };
export type SourceReference =
    | UnknownReference
    | { readonly kind: "none"; readonly raw: string }
    | { readonly kind: "constant"; readonly raw: string; readonly percent: -100 | 100 }
    | {
          readonly kind: "control" | "switch-source";
          readonly raw: string;
          readonly control: string;
          readonly inverted: boolean;
      }
    | {
          readonly kind: "input" | "channel" | "trainer-channel" | "global-variable";
          readonly raw: string;
          readonly indexZeroBased: number;
          readonly inverted: boolean;
      }
    | {
          readonly kind: "logical-switch-source";
          readonly raw: string;
          readonly numberOneBased: number;
          readonly inverted: boolean;
      };

export type SwitchReference =
    | UnknownReference
    | { readonly kind: "none"; readonly raw: string }
    | {
          readonly kind: "physical-switch";
          readonly raw: string;
          readonly control: string;
          readonly positionZeroBased: number;
          readonly inverted: boolean;
      }
    | {
          readonly kind: "logical-switch";
          readonly raw: string;
          readonly numberOneBased: number;
          readonly inverted: boolean;
      }
    | {
          readonly kind: "flight-mode";
          readonly raw: string;
          readonly indexZeroBased: number;
          readonly inverted: boolean;
      };

function unknown(raw: string): UnknownReference {
    return Object.freeze({ kind: "unknown", raw, reason: "Reference is outside the qualified Pocket v2.12.4 subset." });
}

export function decodeSourceReference(raw: string): SourceReference {
    const inverted = raw.startsWith("!");
    const token = inverted ? raw.slice(1) : raw;
    if (token === "NONE" && !inverted) return Object.freeze({ kind: "none", raw });
    if ((token === "MIN" || token === "MAX") && !inverted) {
        return Object.freeze({ kind: "constant", raw, percent: token === "MIN" ? -100 : 100 });
    }
    if (profile.controls.includes(token)) return Object.freeze({ kind: "control", raw, control: token, inverted });
    if (profile.switches.includes(token))
        return Object.freeze({ kind: "switch-source", raw, control: token, inverted });
    const input = /^I(0|[1-9]\d*)$/.exec(token);
    if (input) {
        const indexZeroBased = Number(input[1]);
        if (indexZeroBased < profile.inputCount) return Object.freeze({ kind: "input", raw, indexZeroBased, inverted });
    }
    const indexed = /^(ch|tr|gv)\((0|[1-9]\d*)\)$/.exec(token);
    if (indexed) {
        const indexZeroBased = Number(indexed[2]);
        if (indexed[1] === "ch" && indexZeroBased < profile.outputCount) {
            return Object.freeze({ kind: "channel", raw, indexZeroBased, inverted });
        }
        if (indexed[1] === "tr" && indexZeroBased < profile.trainerChannelCount) {
            return Object.freeze({ kind: "trainer-channel", raw, indexZeroBased, inverted });
        }
        if (indexed[1] === "gv" && indexZeroBased < profile.gvarCount) {
            return Object.freeze({ kind: "global-variable", raw, indexZeroBased, inverted });
        }
    }
    const logical = /^ls\(([1-9]\d*)\)$/.exec(token);
    if (logical) {
        const numberOneBased = Number(logical[1]);
        if (numberOneBased <= profile.logicalSwitchCount) {
            return Object.freeze({ kind: "logical-switch-source", raw, numberOneBased, inverted });
        }
    }
    return unknown(raw);
}

export function decodeSwitchReference(raw: string): SwitchReference {
    const legacy = raw.startsWith("\\") ? raw.slice(1) : raw;
    const inverted = legacy.startsWith("!");
    const token = inverted ? legacy.slice(1) : legacy;
    if (token === "NONE" && !inverted) return Object.freeze({ kind: "none", raw });
    const physical = /^(S[A-E])([0-2])$/.exec(token);
    if (physical) {
        const control = physical[1];
        const positionZeroBased = Number(physical[2]);
        if (positionZeroBased !== 1 || profile.threePositionSwitches.includes(control)) {
            return Object.freeze({ kind: "physical-switch", raw, control, positionZeroBased, inverted });
        }
    }
    const logical = /^L([1-9]\d*)$/.exec(token);
    if (logical) {
        const numberOneBased = Number(logical[1]);
        if (numberOneBased <= profile.logicalSwitchCount) {
            return Object.freeze({ kind: "logical-switch", raw, numberOneBased, inverted });
        }
    }
    const flight = /^FM(0|[1-9]\d*)$/.exec(token);
    if (flight) {
        const indexZeroBased = Number(flight[1]);
        if (indexZeroBased < profile.flightModeCount) {
            return Object.freeze({ kind: "flight-mode", raw, indexZeroBased, inverted });
        }
    }
    return unknown(raw);
}
