import { accessError, fileSource, LocalAccessError } from "./local";
import type { LocalDirectory, LocalEntry, LocalFile } from "./local";

export interface ReadOnlyFileHandle {
    readonly kind: "file";
    getFile(): Promise<File>;
}

export interface ReadOnlyDirectoryHandle {
    readonly kind: "directory";
    readonly name: string;
    values(): AsyncIterable<ReadOnlyFileHandle | ReadOnlyDirectoryHandle>;
}

export interface DirectoryPickerHost {
    readonly isSecureContext: boolean;
    showDirectoryPicker?: (options: { mode: "read" }) => Promise<ReadOnlyDirectoryHandle>;
}

export function directoryCapability(host: DirectoryPickerHost = window) {
    if (!host.isSecureContext) {
        return {
            available: false,
            reason: "Directory access requires HTTPS or localhost. You can still select individual files or archives.",
        };
    }
    if (typeof host.showDirectoryPicker !== "function") {
        return {
            available: false,
            reason: "This browser does not support directory access. Select files or ZIP/.etx archives instead.",
        };
    }
    return {
        available: true,
        reason: "Directories are opened read-only. Choose the mounted SD card or a local copy.",
    };
}

function directoryFromHandle(handle: ReadOnlyDirectoryHandle): LocalDirectory {
    return {
        name: handle.name,
        async *entries(): AsyncIterable<LocalEntry> {
            try {
                for await (const entry of handle.values()) {
                    if (entry.kind === "directory") {
                        yield { kind: "directory", directory: directoryFromHandle(entry) };
                    } else {
                        yield { kind: "file", file: fileSource(await entry.getFile()) };
                    }
                }
            } catch (error) {
                throw accessError(error, `read directory "${handle.name}"`);
            }
        },
    };
}

export async function selectDirectory(host: DirectoryPickerHost = window): Promise<LocalDirectory> {
    const capability = directoryCapability(host);
    if (!capability.available || !host.showDirectoryPicker) {
        throw new LocalAccessError("unsupported", capability.reason);
    }
    try {
        const handle = await host.showDirectoryPicker({ mode: "read" });
        return directoryFromHandle(handle);
    } catch (error) {
        throw accessError(error, "open a directory");
    }
}

export async function downloadOriginal(file: LocalFile): Promise<void> {
    const hasControlCharacter = [...file.name].some((character) => character.charCodeAt(0) < 32);
    if (!file.name || file.name === "." || file.name === ".." || /[/\\]/u.test(file.name) || hasControlCharacter) {
        throw new LocalAccessError(
            "failed",
            "This filename cannot be used for a download. The source was not changed.",
        );
    }
    if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
        throw new LocalAccessError("unsupported", "File downloads are unavailable in this browser.");
    }

    try {
        const blob = await file.getBlob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        document.body.append(anchor);
        try {
            anchor.click();
        } finally {
            anchor.remove();
            // Retain the URL while the browser accepts the download, then release its data.
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
    } catch (error) {
        throw accessError(error, `download "${file.name}"`);
    }
}
