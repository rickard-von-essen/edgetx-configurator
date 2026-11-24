import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWorkspace, snapshotFile, WORKSPACE_LIMITS } from "../../src/features/workspaces/workspace";
import type { RawWorkspace, WorkspaceFile, WorkspaceSource } from "../../src/features/workspaces/workspace";
import { LocalAccessError } from "../../src/services/storage/local";
import type { LocalDirectory, LocalFile } from "../../src/services/storage/local";
import { readBlobBytes } from "./helpers/blob";
import { memoryDirectory, memoryFile } from "./helpers/memoryStorage";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function files(...items: LocalFile[]): WorkspaceSource {
    return { kind: "files", name: "Test selection", files: items };
}

function captured(workspace: RawWorkspace, path: string): WorkspaceFile {
    const entry = workspace.entries.find((item) => item.path === path);
    if (entry?.kind !== "file") throw new Error(`Missing fixture file: ${path}`);
    return entry;
}

async function contents(file: WorkspaceFile) {
    return new Uint8Array(await readBlobBytes(await snapshotFile(file).getBlob()));
}

describe("raw workspace capture", () => {
    it("retains unknown/binary/malformed files, empty files and empty directories without validation or writes", async () => {
        const binary = new Uint8Array([0, 255, 13, 10, 128]);
        const malformed = new TextEncoder().encode("header: [\r\n");
        const source = memoryDirectory("SD-COPY", [
            {
                kind: "directory",
                directory: memoryDirectory("MODELS", [
                    { kind: "file", file: memoryFile("broken.yml", [malformed]) },
                    { kind: "directory", directory: memoryDirectory("EMPTY", []) },
                ]),
            },
            { kind: "file", file: memoryFile("unknown.bin", [binary]) },
            { kind: "file", file: memoryFile("empty.txt", []) },
        ]);
        const workspace = await captureWorkspace({ kind: "directory", directory: source });

        expect(workspace.entries.map((entry) => entry.path)).toEqual([
            "MODELS",
            "MODELS/broken.yml",
            "MODELS/EMPTY",
            "unknown.bin",
            "empty.txt",
        ]);
        expect(workspace.source).toMatchObject({
            kind: "directory",
            name: "SD-COPY",
            readOnly: true,
            radioIdentity: "unverified",
        });
        expect(workspace.contentValidation).toBe("not-run");
        expect(workspace.status).toBe("complete");
        expect(workspace.capturedFiles).toBe(3);
        expect(await contents(captured(workspace, "unknown.bin"))).toEqual(binary);
        expect(Array.from(await contents(captured(workspace, "MODELS/broken.yml")))).toEqual(Array.from(malformed));
        expect(await contents(captured(workspace, "empty.txt"))).toHaveLength(0);
    });

    it("downloads a detached snapshot without reading a source again after it changes", async () => {
        let current = new Blob(["original\r\n"]);
        const original = current;
        const getBlob = vi.fn(async () => current);
        const workspace = await captureWorkspace(
            files({ name: "model.yml", size: current.size, type: "", lastModified: 123, getBlob }),
        );
        current = new Blob(["changed"]);
        const entry = captured(workspace, "model.yml");

        expect(entry.data).not.toBe(original);
        expect(new TextDecoder().decode(await contents(entry))).toBe("original\r\n");
        expect(entry.lastModified).toBe(123);
        expect(getBlob).toHaveBeenCalledOnce();
    });

    it("keeps oversized and over-budget files visible while capturing later files that fit", async () => {
        const huge = memoryFile("large.bin", ["12345"]);
        const getBlob = vi.spyOn(huge, "getBlob");
        const workspace = await captureWorkspace(
            files(
                huge,
                memoryFile("first.bin", ["123"]),
                memoryFile("over.bin", ["12"]),
                memoryFile("last.bin", ["x"]),
            ),
            { limits: { ...WORKSPACE_LIMITS, maxFileBytes: 3, maxTotalBytes: 4 } },
        );

        expect(workspace.status).toBe("incomplete");
        expect(workspace.entries).toHaveLength(4);
        expect(captured(workspace, "large.bin").diagnostics[0]?.code).toBe("file-limit");
        expect(captured(workspace, "over.bin").diagnostics[0]?.code).toBe("workspace-limit");
        expect(captured(workspace, "large.bin").data).toBeNull();
        expect(getBlob).not.toHaveBeenCalled();
        expect(workspace.capturedBytes).toBe(4);
        expect(await contents(captured(workspace, "last.bin"))).toEqual(new Uint8Array([120]));
    });

    it("retains failed file entries and partial directory inventory with explicit diagnostics", async () => {
        const partial: LocalDirectory = {
            name: "PARTIAL",
            async *entries() {
                yield { kind: "file", file: memoryFile("kept.bin", ["kept"]) };
                throw new Error("Source disconnected");
            },
        };
        const source = memoryDirectory("SD", [
            {
                kind: "unreadable-file",
                name: "denied.bin",
                error: new LocalAccessError("denied", "Permission denied."),
            },
            { kind: "directory", directory: partial },
        ]);
        const workspace = await captureWorkspace({ kind: "directory", directory: source });

        expect(workspace.status).toBe("incomplete");
        expect(captured(workspace, "denied.bin")).toMatchObject({ size: null, data: null });
        expect(captured(workspace, "denied.bin").diagnostics[0]?.message).toContain("Permission denied");
        expect(workspace.entries.find((entry) => entry.path === "PARTIAL")?.diagnostics[0]?.code).toBe(
            "unreadable-directory",
        );
        expect(new TextDecoder().decode(await contents(captured(workspace, "PARTIAL/kept.bin")))).toBe("kept");
        expect(() => snapshotFile(captured(workspace, "denied.bin"))).toThrow("No captured bytes");
    });

    it("does not overwrite colliding paths or discard an invalid name", async () => {
        const workspace = await captureWorkspace(
            files(
                memoryFile("MODEL.yml", ["one"]),
                memoryFile("model.yml", ["two"]),
                memoryFile("../escape.yml", ["three"]),
            ),
        );

        expect(workspace.entries).toHaveLength(3);
        expect(new Set(workspace.entries.map((entry) => entry.id)).size).toBe(3);
        expect(workspace.entries[0]?.diagnostics[0]?.code).toBe("path-collision");
        expect(workspace.entries[1]?.diagnostics[0]?.code).toBe("path-collision");
        expect(workspace.entries[2]?.diagnostics[0]?.code).toBe("invalid-path");
        expect(workspace.status).toBe("incomplete");
        expect(new TextDecoder().decode(await contents(captured(workspace, "model.yml")))).toBe("two");
    });

    it("bounds enumeration and reports the first omitted region instead of claiming completeness", async () => {
        const workspace = await captureWorkspace(
            files(memoryFile("one", []), memoryFile("two", []), memoryFile("three", [])),
            { limits: { ...WORKSPACE_LIMITS, maxEntries: 2 } },
        );

        expect(workspace.entries.map((entry) => entry.path)).toEqual(["one", "two"]);
        expect(workspace.status).toBe("incomplete");
        expect(workspace.diagnostics[0]).toMatchObject({ code: "entry-limit", path: "three" });
    });

    it("records over-depth directories without enumerating their children", async () => {
        const deep = memoryDirectory("DEEP", [{ kind: "file", file: memoryFile("hidden", ["data"]) }]);
        const enumerate = vi.spyOn(deep, "entries");
        const root = memoryDirectory("ROOT", [
            {
                kind: "directory",
                directory: memoryDirectory("FIRST", [{ kind: "directory", directory: deep }]),
            },
        ]);
        const workspace = await captureWorkspace(
            { kind: "directory", directory: root },
            { limits: { ...WORKSPACE_LIMITS, maxDirectoryDepth: 1 } },
        );

        expect(workspace.entries.map((entry) => entry.path)).toEqual(["FIRST", "FIRST/DEEP"]);
        expect(workspace.entries[1]?.diagnostics[0]?.code).toBe("depth-limit");
        expect(enumerate).not.toHaveBeenCalled();
        expect(workspace.status).toBe("incomplete");
    });

    it("rejects cancellation instead of publishing a partial replacement workspace", async () => {
        const controller = new AbortController();
        const later = memoryFile("later", ["later"]);
        const getBlob = vi.spyOn(later, "getBlob");
        await expect(
            captureWorkspace(files(memoryFile("first", ["first"]), later), {
                signal: controller.signal,
                onProgress: () => controller.abort(),
            }),
        ).rejects.toMatchObject({ kind: "cancelled" });
        expect(getBlob).not.toHaveBeenCalled();
    });

    it("cancels a pending byte read and does not report it as an unreadable-file success", async () => {
        const controller = new AbortController();
        vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementation(() => controller.abort());
        await expect(
            captureWorkspace(files(memoryFile("model.yml", ["data"])), { signal: controller.signal }),
        ).rejects.toMatchObject({ kind: "cancelled" });
    });

    it("diagnoses changed sizes and file-read errors without dropping the entries", async () => {
        const source = files(
            {
                name: "changed",
                size: 1,
                type: "",
                async getBlob() {
                    return new Blob(["longer"]);
                },
            },
            {
                name: "gone",
                size: 1,
                type: "",
                async getBlob(): Promise<Blob> {
                    throw new Error("Disconnected");
                },
            },
        );
        const workspace = await captureWorkspace(source);

        expect(workspace.entries).toHaveLength(2);
        expect(captured(workspace, "changed").diagnostics[0]?.code).toBe("changed-source");
        expect(captured(workspace, "gone").diagnostics[0]?.code).toBe("unreadable");
        expect(workspace.capturedBytes).toBe(0);
        expect(workspace.status).toBe("incomplete");
    });

    it("distinguishes a source-aborted read from user cancellation", async () => {
        const workspace = await captureWorkspace(
            files({
                name: "aborted.bin",
                size: 1,
                type: "",
                async getBlob(): Promise<Blob> {
                    throw new DOMException("Source read aborted", "AbortError");
                },
            }),
        );

        expect(workspace.status).toBe("incomplete");
        expect(workspace.entries[0]?.diagnostics[0]?.message).toContain("source aborted");
        expect(workspace.entries[0]?.diagnostics[0]?.message).not.toContain("previous");
    });

    it("reports snapshot allocation failure instead of leaving capture unresolved", async () => {
        const source = files(memoryFile("model.yml", ["data"]));
        let allocations = 0;
        vi.stubGlobal("Blob", function FailedBlob() {
            allocations++;
            throw new Error("Snapshot allocation failed");
        });
        const workspace = await captureWorkspace(source);

        expect(workspace.status).toBe("incomplete");
        expect(workspace.capturedFiles).toBe(0);
        expect(workspace.entries[0]?.diagnostics[0]?.code).toBe("unreadable");
        expect(allocations).toBe(1);
    });
});
