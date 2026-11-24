import { accessError, LocalAccessError } from "../../services/storage/local";
import type { LocalDirectory, LocalFile } from "../../services/storage/local";
import { checkCaptureCancellation, snapshotBlob } from "../../services/storage/snapshot";

export interface WorkspaceLimits {
    readonly maxTotalBytes: number;
    readonly maxFileBytes: number;
    readonly maxEntries: number;
    readonly maxDirectoryDepth: number;
}

export const WORKSPACE_LIMITS: WorkspaceLimits = Object.freeze({
    maxTotalBytes: 512 * 1024 * 1024,
    maxFileBytes: 64 * 1024 * 1024,
    maxEntries: 20_000,
    maxDirectoryDepth: 64,
});

export type WorkspaceSource =
    | { readonly kind: "files"; readonly name: string; readonly files: readonly LocalFile[] }
    | { readonly kind: "directory"; readonly directory: LocalDirectory };

export interface WorkspaceDiagnostic {
    readonly code: string;
    readonly path: string;
    readonly message: string;
}

interface EntryBase {
    readonly id: number;
    readonly path: string;
    readonly name: string;
    readonly diagnostics: readonly WorkspaceDiagnostic[];
}

export interface WorkspaceFile extends EntryBase {
    readonly kind: "file";
    readonly size: number | null;
    readonly type: string;
    readonly lastModified?: number;
    readonly data: Blob | null;
}

export interface WorkspaceDirectory extends EntryBase {
    readonly kind: "directory";
}

export type WorkspaceEntry = WorkspaceFile | WorkspaceDirectory;

export interface RawWorkspace {
    readonly source: {
        readonly kind: "files" | "directory";
        readonly name: string;
        readonly readOnly: true;
        readonly radioIdentity: "unverified";
    };
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly contentValidation: "not-run";
    readonly status: "complete" | "incomplete";
    readonly limits: WorkspaceLimits;
    readonly entries: readonly WorkspaceEntry[];
    readonly diagnostics: readonly WorkspaceDiagnostic[];
    readonly capturedBytes: number;
    readonly capturedFiles: number;
    readonly issueCount: number;
}

export interface CaptureProgress {
    readonly entries: number;
    readonly capturedFiles: number;
    readonly capturedBytes: number;
    readonly currentPath: string;
}

interface CaptureOptions {
    readonly signal?: AbortSignal;
    readonly limits?: WorkspaceLimits;
    readonly onProgress?: (progress: CaptureProgress) => void;
}

type DraftEntry =
    | (Omit<WorkspaceFile, "diagnostics" | "data"> & { diagnostics: WorkspaceDiagnostic[]; data: Blob | null })
    | (Omit<WorkspaceDirectory, "diagnostics"> & { diagnostics: WorkspaceDiagnostic[] });

function validName(name: string) {
    return (
        Boolean(name) &&
        name !== "." &&
        name !== ".." &&
        !/[/\\]/u.test(name) &&
        ![...name].some((character) => character.charCodeAt(0) < 32)
    );
}

function readFailure(error: unknown, operation: string) {
    const failure = accessError(error, operation);
    return failure.kind === "cancelled"
        ? `The source aborted an operation while trying to ${operation}.`
        : failure.message;
}

export async function captureWorkspace(source: WorkspaceSource, options: CaptureOptions = {}): Promise<RawWorkspace> {
    const limits = Object.freeze({ ...(options.limits ?? WORKSPACE_LIMITS) });
    for (const [key, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < (key === "maxEntries" ? 1 : 0)) {
            throw new RangeError(`Invalid workspace limit: ${key}`);
        }
    }
    const startedAt = new Date().toISOString();
    const entries: DraftEntry[] = [];
    const diagnostics: WorkspaceDiagnostic[] = [];
    const paths = new Map<string, DraftEntry>();
    let capturedBytes = 0;
    let capturedFiles = 0;
    let stopped = false;

    function diagnostic(code: string, path: string, message: string): WorkspaceDiagnostic {
        return Object.freeze({ code, path, message });
    }

    function addEntry(entry: DraftEntry): boolean {
        if (entries.length >= limits.maxEntries) {
            diagnostics.push(
                diagnostic(
                    "entry-limit",
                    entry.path,
                    `The ${limits.maxEntries}-entry limit was reached. Additional entries were not enumerated.`,
                ),
            );
            stopped = true;
            return false;
        }
        const key = entry.path.normalize("NFC").toLowerCase();
        const existing = paths.get(key);
        if (existing) {
            const issue = diagnostic(
                "path-collision",
                entry.path,
                "Conflicting file/directory paths are retained as separate entries; this tree is ambiguous.",
            );
            existing.diagnostics.push(issue);
            entry.diagnostics.push(issue);
        } else {
            paths.set(key, entry);
        }
        if (!validName(entry.name)) {
            entry.diagnostics.push(
                diagnostic("invalid-path", entry.path, "This name cannot be safely represented as a relative path."),
            );
        }
        entries.push(entry);
        return true;
    }

    function progress(path: string) {
        options.onProgress?.({ entries: entries.length, capturedBytes, capturedFiles, currentPath: path });
    }

    async function captureFile(file: LocalFile, path: string) {
        const entry: DraftEntry & { kind: "file" } = {
            id: entries.length,
            kind: "file",
            name: file.name,
            path,
            size: Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : null,
            type: file.type,
            lastModified: file.lastModified,
            data: null,
            diagnostics: [],
        };
        if (!addEntry(entry)) return;
        if (entry.size === null) {
            entry.diagnostics.push(diagnostic("invalid-size", path, "The source provided an invalid file size."));
        } else if (entry.size > limits.maxFileBytes) {
            entry.diagnostics.push(
                diagnostic("file-limit", path, `File exceeds the ${limits.maxFileBytes}-byte per-file capture limit.`),
            );
        } else if (capturedBytes + entry.size > limits.maxTotalBytes) {
            entry.diagnostics.push(
                diagnostic(
                    "workspace-limit",
                    path,
                    `File exceeds the remaining ${limits.maxTotalBytes}-byte RAM budget.`,
                ),
            );
        } else {
            try {
                const blob = await file.getBlob();
                checkCaptureCancellation(options.signal);
                if (blob.size !== entry.size) {
                    entry.diagnostics.push(
                        diagnostic("changed-source", path, "The source size changed before capture. Select it again."),
                    );
                } else {
                    entry.data = await snapshotBlob(blob, options.signal);
                    capturedBytes += entry.data.size;
                    capturedFiles++;
                }
            } catch (error) {
                checkCaptureCancellation(options.signal);
                entry.diagnostics.push(diagnostic("unreadable", path, readFailure(error, `capture "${path}"`)));
            }
        }
        progress(path);
    }

    async function captureDirectory(directory: LocalDirectory, parent: string, depth: number, owner?: DraftEntry) {
        try {
            for await (const child of directory.entries()) {
                checkCaptureCancellation(options.signal);
                const name =
                    child.kind === "file"
                        ? child.file.name
                        : child.kind === "directory"
                          ? child.directory.name
                          : child.name;
                const path = parent ? `${parent}/${name}` : name;
                if (child.kind === "file") {
                    await captureFile(child.file, path);
                } else if (child.kind === "unreadable-file") {
                    if (
                        !addEntry({
                            id: entries.length,
                            kind: "file",
                            name,
                            path,
                            size: null,
                            type: "",
                            data: null,
                            diagnostics: [
                                diagnostic("unreadable", path, readFailure(child.error, `capture "${path}"`)),
                            ],
                        })
                    ) {
                        break;
                    }
                    progress(path);
                } else {
                    const entry: DraftEntry = {
                        id: entries.length,
                        kind: "directory",
                        name,
                        path,
                        diagnostics: [],
                    };
                    if (!addEntry(entry)) break;
                    if (depth + 1 > limits.maxDirectoryDepth) {
                        entry.diagnostics.push(
                            diagnostic(
                                "depth-limit",
                                path,
                                `Children were not enumerated beyond ${limits.maxDirectoryDepth} directory levels.`,
                            ),
                        );
                    } else if (validName(name)) {
                        await captureDirectory(child.directory, path, depth + 1, entry);
                    }
                    progress(path);
                }
                if (stopped) break;
            }
        } catch (error) {
            checkCaptureCancellation(options.signal);
            const issue = diagnostic(
                "unreadable-directory",
                parent,
                `${readFailure(error, "enumerate the directory")} Additional entries may be missing.`,
            );
            (owner?.diagnostics ?? diagnostics).push(issue);
        }
    }

    checkCaptureCancellation(options.signal);
    if (source.kind === "files") {
        for (const file of [...source.files]) {
            checkCaptureCancellation(options.signal);
            await captureFile(file, file.name);
            if (stopped) break;
        }
    } else {
        await captureDirectory(source.directory, "", 0);
    }
    checkCaptureCancellation(options.signal);
    const frozenEntries = Object.freeze(
        entries.map((entry) => Object.freeze({ ...entry, diagnostics: Object.freeze([...entry.diagnostics]) })),
    );
    const issueCount = diagnostics.length + entries.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
    return Object.freeze({
        source: Object.freeze({
            kind: source.kind,
            name: source.kind === "files" ? source.name : source.directory.name,
            readOnly: true,
            radioIdentity: "unverified",
        }),
        startedAt,
        finishedAt: new Date().toISOString(),
        contentValidation: "not-run",
        status: issueCount ? "incomplete" : "complete",
        limits,
        entries: frozenEntries,
        diagnostics: Object.freeze(diagnostics),
        capturedBytes,
        capturedFiles,
        issueCount,
    });
}

export function snapshotFile(entry: WorkspaceFile): LocalFile {
    const data = entry.data;
    if (!data) {
        throw new LocalAccessError(
            "failed",
            `No captured bytes are available for "${entry.path}". See its diagnostics.`,
        );
    }
    return {
        name: entry.name,
        size: data.size,
        type: entry.type,
        lastModified: entry.lastModified,
        async getBlob() {
            return data;
        },
    };
}
