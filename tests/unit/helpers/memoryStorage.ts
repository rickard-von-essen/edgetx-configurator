import type { LocalDirectory, LocalEntry, LocalFile } from "../../../src/services/storage/local";

export function memoryFile(name: string, parts: BlobPart[], type = "application/octet-stream"): LocalFile {
    const blob = new Blob(parts, { type });
    return {
        name,
        size: blob.size,
        type: blob.type,
        async getBlob() {
            return blob;
        },
    };
}

export function memoryDirectory(name: string, entries: readonly LocalEntry[]): LocalDirectory {
    const snapshot = [...entries];
    return {
        name,
        async *entries() {
            yield* snapshot;
        },
    };
}
