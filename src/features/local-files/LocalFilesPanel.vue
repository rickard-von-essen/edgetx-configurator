<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import { directoryCapability, downloadOriginal, selectDirectory } from "../../services/storage/browser";
import { accessError, filesFromSelection } from "../../services/storage/local";
import WorkspacePanel from "../workspaces/WorkspacePanel.vue";
import { captureWorkspace, snapshotFile, WORKSPACE_LIMITS } from "../workspaces/workspace";
import type { RawWorkspace, WorkspaceFile, WorkspaceSource } from "../workspaces/workspace";

const capability = directoryCapability();
const workspace = shallowRef<RawWorkspace>();
const busy = ref(false);
const capturing = ref(false);
const cancelling = ref(false);
const status = ref("");
const errorMessage = ref("");
let captureController: AbortController | undefined;
let disposed = false;

onBeforeUnmount(() => {
    disposed = true;
    captureController?.abort();
    workspace.value = undefined;
});

function report(error: unknown) {
    const failure = accessError(error, "access local files");
    if (failure.kind === "cancelled") {
        status.value = failure.message;
    } else {
        errorMessage.value = failure.message;
    }
}

function cancelFiles() {
    errorMessage.value = "";
    status.value = "Selection cancelled. Your previous selection is unchanged.";
}

async function openWorkspace(source: WorkspaceSource) {
    captureController = new AbortController();
    busy.value = true;
    capturing.value = true;
    cancelling.value = false;
    errorMessage.value = "";
    status.value = "Capturing source bytes in RAM. Source files are unchanged.";
    try {
        const result = await captureWorkspace(source, {
            signal: captureController.signal,
            onProgress(progress) {
                if (!disposed && !cancelling.value) {
                    status.value = `Recorded ${progress.entries} entries; captured ${progress.capturedBytes} bytes.`;
                }
            },
        });
        if (disposed) return;
        workspace.value = result;
        status.value =
            result.status === "complete"
                ? "Read-only workspace captured in RAM. Source files are unchanged."
                : "Incomplete workspace opened. Review its diagnostics. Source files are unchanged.";
    } catch (error) {
        report(error);
    } finally {
        captureController = undefined;
        capturing.value = false;
        cancelling.value = false;
        busy.value = false;
    }
}

async function selectFiles(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
        errorMessage.value = "The file selector is unavailable. Reload the page and try again.";
        return;
    }
    if (!input.files?.length) {
        cancelFiles();
        return;
    }
    const files = filesFromSelection(input.files);
    input.value = "";
    await openWorkspace({ kind: "files", name: "Selected files", files });
}

async function openDirectory() {
    busy.value = true;
    errorMessage.value = "";
    status.value = "";
    try {
        const directory = await selectDirectory();
        if (disposed) return;
        await openWorkspace({ kind: "directory", directory });
    } catch (error) {
        report(error);
    } finally {
        busy.value = false;
    }
}

async function download(file: WorkspaceFile) {
    busy.value = true;
    errorMessage.value = "";
    status.value = "";
    try {
        await downloadOriginal(snapshotFile(file));
        status.value = `Download requested for "${file.name}". Verify the saved file; download completion cannot be confirmed here.`;
    } catch (error) {
        report(error);
    } finally {
        busy.value = false;
    }
}

function cancelCapture() {
    cancelling.value = true;
    status.value = "Cancellation requested. Waiting for the current source operation to finish.";
    captureController?.abort();
}

function closeWorkspace() {
    workspace.value = undefined;
    errorMessage.value = "";
    status.value = "Workspace closed. Source files are unchanged.";
}
</script>

<template>
    <section aria-labelledby="local-files-heading" class="space-y-5">
        <div class="space-y-2">
            <h2 id="local-files-heading" class="text-xl font-semibold">Local files</h2>
            <p class="text-muted">
                Open files or a directory as a raw, read-only workspace. Original bytes are copied into RAM; archives
                are not unpacked and content is not validated yet. Nothing is written to the selected source.
            </p>
            <p class="text-sm text-muted">
                Capture limits: {{ WORKSPACE_LIMITS.maxTotalBytes / (1024 * 1024) }} MiB per workspace,
                {{ WORKSPACE_LIMITS.maxFileBytes / (1024 * 1024) }} MiB per file,
                {{ WORKSPACE_LIMITS.maxEntries.toLocaleString() }} entries and
                {{ WORKSPACE_LIMITS.maxDirectoryDepth }} nested directory levels. Uncaptured entries or regions are
                reported explicitly. Workspaces are not automatically saved.
            </p>
        </div>

        <div class="space-y-2">
            <label for="local-file-input" class="block font-medium">Select files or archives</label>
            <input
                id="local-file-input"
                type="file"
                multiple
                :disabled="busy"
                class="block w-full rounded-md border border-default p-3"
                @change="selectFiles"
                @cancel="cancelFiles"
            />
        </div>

        <div class="space-y-2">
            <UButton
                :disabled="!capability.available || busy"
                aria-describedby="directory-capability"
                @click="openDirectory"
            >
                Select directory (read-only)
            </UButton>
            <p id="directory-capability" class="text-sm text-muted">{{ capability.reason }}</p>
        </div>

        <UButton v-if="capturing" :disabled="cancelling" @click="cancelCapture">Cancel capture</UButton>
        <WorkspacePanel v-if="workspace" :workspace="workspace" :busy="busy" @download="download" />
        <UButton v-if="workspace" variant="outline" color="neutral" :disabled="busy" @click="closeWorkspace">
            Close workspace
        </UButton>
        <p role="status" aria-live="polite">{{ status }}</p>
        <p v-if="errorMessage" role="alert" class="text-error">{{ errorMessage }}</p>
    </section>
</template>
