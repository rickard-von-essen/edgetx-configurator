import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "../fixtures/pocket-2.12.4/manifest.json";

function fixture(path: string) {
    return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/pocket-2.12.4", path));
}

function checksum(data: Uint8Array) {
    let crc = 0xffff;
    for (const byte of data.slice(data.indexOf(10) + 1)) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
        }
    }
    return crc;
}

describe("Pocket v2.12.4 fixture corpus", () => {
    it.each(manifest.files)("preserves the reviewed bytes of $path", ({ path, size, sha256 }) => {
        const data = fixture(path);

        expect(data.byteLength).toBe(size);
        expect(createHash("sha256").update(data).digest("hex")).toBe(sha256);
    });

    it.each(["native/RADIO/radio.yml", "companion/RADIO/radio.yml"])(
        "keeps a valid native checksum after sanitizing %s",
        (path) => {
            const data = fixture(path);
            const declared = Number(data.subarray(0, data.indexOf(10)).toString().split(":")[1]);

            expect(checksum(data)).toBe(declared);
        },
    );

    it("keeps the negative checksum case detectably invalid", () => {
        const data = fixture("cases/checksum-mismatch.yml");
        const declared = Number(data.subarray(0, data.indexOf(10)).toString().split(":")[1]);

        expect(declared).not.toBe(0);
        expect(checksum(data)).not.toBe(declared);
    });

    it.each([
        "native/RADIO/radio.yml",
        "native/MODELS/model07.yml",
        "companion/RADIO/radio.yml",
        "companion/MODELS/model07.yml",
    ])("publishes no registration identity in %s", (path) => {
        const text = fixture(path).toString();
        const registrations = [...text.matchAll(/^(?:owner|model)RegistrationID: *([^\r\n]*)/gm)];

        expect(registrations).toHaveLength(1);
        expect(registrations[0]?.[1]).toBe('""');
    });

    it.each(["native/RADIO/radio.yml", "companion/RADIO/radio.yml"])(
        "replaces device calibration with explicit test values in %s",
        (path) => {
            const values = [
                ...fixture(path)
                    .toString()
                    .matchAll(/^\s+(?:mid|spanNeg|spanPos): *(\d+)/gm),
            ].map((match) => match[1]);

            expect(values).toHaveLength(15);
            expect(new Set(values)).toEqual(new Set(["1024"]));
        },
    );
});
