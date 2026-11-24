import { afterEach, describe, expect, it, vi } from "vitest";
import { directoryCapability, downloadOriginal, selectDirectory } from "../../src/services/storage/browser";
import { filesFromSelection, LocalAccessError } from "../../src/services/storage/local";
import type { LocalDirectory, LocalEntry } from "../../src/services/storage/local";
import { memoryDirectory, memoryFile } from "./helpers/memoryStorage";
import { readBlobBytes as bytes } from "./helpers/blob";

async function entries(directory: LocalDirectory) {
    const result: LocalEntry[] = [];
    for await (const entry of directory.entries()) result.push(entry);
    return result;
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("read-only storage adapters", () => {
    it("preserves binary bytes and separate same-name selections without parsing archives", async () => {
        const original = new Uint8Array([0, 255, 13, 10, 128]);
        const files = filesFromSelection([new File([original], "archive.etx"), new File(["second"], "archive.etx")]);

        expect(files).toHaveLength(2);
        expect(new Uint8Array(await bytes(await files[0]!.getBlob()))).toEqual(original);
        expect(files[1]?.size).toBe(6);
    });

    it("represents nested and empty directories in memory without exposing writes", async () => {
        const contents = new Uint8Array([1, 2, 3]);
        const file = memoryFile("model.yml", [contents]);
        const children = [
            { kind: "file", file },
            { kind: "directory", directory: memoryDirectory("EMPTY", []) },
        ] satisfies Parameters<typeof memoryDirectory>[1];
        const root = memoryDirectory("MODELS", children);
        children.length = 0;
        contents.fill(0);

        const result = await entries(root);
        expect(result).toHaveLength(2);
        expect(new Uint8Array(await bytes(await file.getBlob()))).toEqual(new Uint8Array([1, 2, 3]));
        const empty = result[1];
        expect(empty?.kind).toBe("directory");
        if (empty?.kind !== "directory") throw new Error("Expected the empty directory");
        expect(await entries(empty.directory)).toEqual([]);
    });

    it("requests only read permission and lazily reads selected directory entries", async () => {
        const getFile = vi.fn(async () => new File(["raw"], "radio.yml"));
        const picker = vi.fn(async () => ({
            kind: "directory" as const,
            name: "RADIO",
            async *values() {
                yield { kind: "file" as const, name: "radio.yml", getFile };
                yield {
                    kind: "directory" as const,
                    name: "EMPTY",
                    async *values() {},
                };
            },
        }));
        const directory = await selectDirectory({ isSecureContext: true, showDirectoryPicker: picker });

        expect(picker).toHaveBeenCalledWith({ mode: "read" });
        expect(getFile).not.toHaveBeenCalled();
        const result = await entries(directory);
        expect(result.map((entry) => entry.kind)).toEqual(["file", "directory"]);
        expect(getFile).toHaveBeenCalledOnce();
    });

    it("retains a known unreadable file and continues enumerating its siblings", async () => {
        const directory = await selectDirectory({
            isSecureContext: true,
            async showDirectoryPicker() {
                return {
                    kind: "directory",
                    name: "SD",
                    async *values() {
                        yield {
                            kind: "file" as const,
                            name: "denied.bin",
                            async getFile(): Promise<File> {
                                throw new DOMException("Read denied", "NotAllowedError");
                            },
                        };
                        yield {
                            kind: "file" as const,
                            name: "available.bin",
                            async getFile() {
                                return new File(["ok"], "available.bin");
                            },
                        };
                    },
                };
            },
        });

        const result = await entries(directory);
        expect(result.map((entry) => entry.kind)).toEqual(["unreadable-file", "file"]);
        expect(result[0]).toMatchObject({ name: "denied.bin", error: { kind: "denied" } });
    });

    it.each([
        ["AbortError", "cancelled"],
        ["NotAllowedError", "denied"],
        ["SecurityError", "denied"],
        ["NotFoundError", "failed"],
    ])("surfaces picker %s as %s", async (name, kind) => {
        const host = {
            isSecureContext: true,
            showDirectoryPicker: vi.fn(async () => {
                throw new DOMException("Selection failed", name);
            }),
        };
        await expect(selectDirectory(host)).rejects.toMatchObject({ kind });
    });

    it("surfaces permission loss during enumeration instead of returning a partial success", async () => {
        const directory = await selectDirectory({
            isSecureContext: true,
            async showDirectoryPicker() {
                return {
                    kind: "directory",
                    name: "SD",
                    async *values() {
                        yield await Promise.reject(new DOMException("Read denied", "NotAllowedError"));
                    },
                };
            },
        });

        await expect(entries(directory)).rejects.toMatchObject({ kind: "denied" });
    });

    it("explains unsupported/insecure directory access while leaving file fallback independent", async () => {
        const picker = vi.fn();
        expect(directoryCapability({ isSecureContext: true }).reason).toContain("Select files");
        expect(directoryCapability({ isSecureContext: false, showDirectoryPicker: picker }).reason).toContain("HTTPS");
        await expect(selectDirectory({ isSecureContext: false, showDirectoryPicker: picker })).rejects.toMatchObject({
            kind: "unsupported",
        });
        expect(picker).not.toHaveBeenCalled();
        expect(filesFromSelection([new File([], "empty.zip")])).toHaveLength(1);
    });
});

describe("unchanged-file downloads", () => {
    it("downloads the original blob and releases its URL after browser handoff", async () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn(() => "blob:test");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this);
        });
        const file = memoryFile("model.yml", ["line\r\n"]);

        await downloadOriginal(file);

        expect(createObjectURL).toHaveBeenCalledWith(await file.getBlob());
        const [anchor] = clicked;
        expect(anchor?.download).toBe("model.yml");
        expect(anchor?.getAttribute("href")).toBe("blob:test");
        expect(document.querySelector("a")).toBeNull();
        expect(revokeObjectURL).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    });

    it("rejects unsafe output names before opening file data", async () => {
        const getBlob = vi.fn();
        await expect(downloadOriginal({ name: "../radio.yml", size: 0, type: "", getBlob })).rejects.toBeInstanceOf(
            LocalAccessError,
        );
        expect(getBlob).not.toHaveBeenCalled();
    });

    it("reports an unavailable download API explicitly", async () => {
        vi.stubGlobal("URL", {});
        await expect(downloadOriginal(memoryFile("model.yml", ["raw"]))).rejects.toMatchObject({ kind: "unsupported" });
    });
});
