<script setup lang="ts">
import { ref, shallowRef } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import { directoryCapability, downloadOriginal, selectDirectory } from "../../services/storage/browser";
import { accessError, filesFromSelection } from "../../services/storage/local";
import type { LocalDirectory, LocalFile } from "../../services/storage/local";

const capability = directoryCapability();
const files = shallowRef<LocalFile[]>([]);
const directory = shallowRef<LocalDirectory>();
const busy = ref(false);
const status = ref("");
const errorMessage = ref("");

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

function selectFiles(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
        errorMessage.value = "The file selector is unavailable. Reload the page and try again.";
        return;
    }
    if (!input.files?.length) {
        cancelFiles();
        return;
    }
    files.value = filesFromSelection(input.files);
    directory.value = undefined;
    errorMessage.value = "";
    status.value = `${files.value.length} file(s) selected. Source files are unchanged.`;
    input.value = "";
}

async function openDirectory() {
    busy.value = true;
    errorMessage.value = "";
    status.value = "";
    try {
        directory.value = await selectDirectory();
        files.value = [];
        status.value = "Directory selected read-only. Browsing and backup creation will be added in later tasks.";
    } catch (error) {
        report(error);
    } finally {
        busy.value = false;
    }
}

async function download(file: LocalFile) {
    busy.value = true;
    errorMessage.value = "";
    status.value = "";
    try {
        await downloadOriginal(file);
        status.value = `Download requested for "${file.name}". Verify the saved file; download completion cannot be confirmed here.`;
    } catch (error) {
        report(error);
    } finally {
        busy.value = false;
    }
}

function clearSelection() {
    files.value = [];
    directory.value = undefined;
    errorMessage.value = "";
    status.value = "Selection cleared. Source files are unchanged.";
}
</script>

<template>
    <section aria-labelledby="local-files-heading" class="max-w-3xl space-y-5">
        <div class="space-y-2">
            <h2 id="local-files-heading" class="text-xl font-semibold">Local files</h2>
            <p class="text-muted">
                Select local files or ZIP/.etx archives to download unchanged copies. Archives are not unpacked in this
                step, and no files are written to the selected source.
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

        <p v-if="directory" class="font-medium">Selected directory: {{ directory.name }}</p>

        <ul v-if="files.length" aria-label="Selected files" class="space-y-3">
            <li
                v-for="(file, index) in files"
                :key="`${index}-${file.name}`"
                class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-default p-3"
            >
                <span class="break-all">{{ file.name }} — {{ file.size }} bytes</span>
                <UButton
                    variant="outline"
                    color="neutral"
                    :disabled="busy"
                    :aria-label="`Download ${file.name}`"
                    @click="download(file)"
                >
                    Download original
                </UButton>
            </li>
        </ul>

        <p v-if="files.length" class="text-sm text-muted">
            Save downloaded copies outside the radio/SD card. A downloaded file is not a complete radio backup.
        </p>
        <UButton
            v-if="files.length || directory"
            variant="outline"
            color="neutral"
            :disabled="busy"
            @click="clearSelection"
        >
            Clear selection
        </UButton>
        <p role="status" aria-live="polite">{{ status }}</p>
        <p v-if="errorMessage" role="alert" class="text-error">{{ errorMessage }}</p>
    </section>
</template>
