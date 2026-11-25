export function crc16Ccitt(bytes: Uint8Array): number {
    let crc = 0xffff;
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
        }
    }
    return crc;
}

export function inspectRadioChecksum(bytes: Uint8Array) {
    const newline = bytes.indexOf(10);
    if (newline < 0 || newline > 30) return undefined;
    const lineBytes = bytes.subarray(0, newline);
    if (lineBytes.some((byte) => byte > 127)) return undefined;
    const line = String.fromCharCode(...lineBytes);
    const header = /^(checksum: [ \t]*)(\d{1,5})(\r?)$/.exec(line);
    if (!header || Number(header[2]) > 0xffff) return undefined;
    return {
        declared: Number(header[2]),
        computed: crc16Ccitt(bytes.subarray(newline + 1)),
        prefix: header[1],
        width: header[2].length,
        ending: header[3] + "\n",
        bodyOffset: newline + 1,
    };
}

export function replaceRadioChecksum(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const info = inspectRadioChecksum(bytes);
    if (!info) throw new Error("Radio settings require a supported first-line checksum header.");
    if (info.declared === info.computed) return new Uint8Array(bytes);
    const header = new TextEncoder().encode(
        info.prefix + String(info.computed).padStart(info.width, "0") + info.ending,
    );
    const output = new Uint8Array(header.byteLength + bytes.byteLength - info.bodyOffset);
    output.set(header);
    output.set(bytes.subarray(info.bodyOffset), header.byteLength);
    return output;
}
