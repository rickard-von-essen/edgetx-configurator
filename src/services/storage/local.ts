export interface LocalFile {
    readonly name: string;
    readonly size: number;
    readonly type: string;
    getBlob(): Promise<Blob>;
}

export type LocalEntry =
    | { readonly kind: "file"; readonly file: LocalFile }
    | { readonly kind: "directory"; readonly directory: LocalDirectory };

export interface LocalDirectory {
    readonly name: string;
    entries(): AsyncIterable<LocalEntry>;
}

export class LocalAccessError extends Error {
    constructor(
        readonly kind: "cancelled" | "denied" | "unsupported" | "failed",
        message: string,
        cause?: unknown,
    ) {
        super(message, { cause });
        this.name = "LocalAccessError";
    }
}

export function accessError(error: unknown, operation: string): LocalAccessError {
    if (error instanceof LocalAccessError) {
        return error;
    }

    const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
    if (name === "AbortError") {
        return new LocalAccessError("cancelled", "Selection cancelled. Your previous selection is unchanged.", error);
    }
    if (name === "NotAllowedError" || name === "SecurityError") {
        return new LocalAccessError(
            "denied",
            `Permission denied while trying to ${operation}. Select the source again and allow read access.`,
            error,
        );
    }
    return new LocalAccessError(
        "failed",
        `Could not ${operation}. Check that the source is still available and try again.`,
        error,
    );
}

export function fileSource(file: File): LocalFile {
    return {
        name: file.name,
        size: file.size,
        type: file.type,
        async getBlob() {
            return file;
        },
    };
}

export function filesFromSelection(files: Iterable<File>): LocalFile[] {
    return Array.from(files, fileSource);
}
