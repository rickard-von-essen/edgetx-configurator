import { LocalAccessError } from "./local";

export function checkCaptureCancellation(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new LocalAccessError("cancelled", "Workspace capture cancelled. Your previous workspace is unchanged.");
    }
}

export function snapshotBlob(blob: Blob, signal?: AbortSignal): Promise<Blob> {
    checkCaptureCancellation(signal);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        function cleanup() {
            signal?.removeEventListener("abort", cancel);
            reader.onload = null;
            reader.onerror = null;
            reader.onabort = null;
        }
        function cancel() {
            cleanup();
            reader.abort();
            reject(
                new LocalAccessError("cancelled", "Workspace capture cancelled. Your previous workspace is unchanged."),
            );
        }
        reader.onload = () => {
            cleanup();
            try {
                checkCaptureCancellation(signal);
                if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength !== blob.size) {
                    throw new Error("The source did not provide the expected binary file data.");
                }
                // Materialize bytes: retaining a File or slice alone can still depend on a changing disk file.
                resolve(new Blob([reader.result], { type: blob.type }));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => {
            cleanup();
            reject(reader.error ?? new Error("The file could not be read."));
        };
        reader.onabort = cancel;
        signal?.addEventListener("abort", cancel, { once: true });
        try {
            reader.readAsArrayBuffer(blob);
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}
