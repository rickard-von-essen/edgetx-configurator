<script setup lang="ts">
import { computed, ref, watch } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import type { RawWorkspace, WorkspaceFile } from "./workspace";

const props = defineProps<{ workspace: RawWorkspace; busy: boolean }>();
const emit = defineEmits<{ download: [file: WorkspaceFile] }>();
const view = ref<"inventory" | "backup" | "restore">("inventory");
const page = ref(0);
const pageSize = 100;
const pageCount = computed(() => Math.max(1, Math.ceil(props.workspace.entries.length / pageSize)));
const visibleEntries = computed(() =>
    props.workspace.entries.slice(page.value * pageSize, (page.value + 1) * pageSize),
);

watch(
    () => props.workspace,
    () => {
        page.value = 0;
        view.value = "inventory";
    },
);
</script>

<template>
    <section aria-labelledby="workspace-heading" class="space-y-4 rounded-md border border-default p-4">
        <h3 id="workspace-heading" class="text-xl font-semibold">Raw workspace</h3>
        <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt class="font-medium">Source</dt>
            <dd v-if="workspace.source.kind === 'directory'">Selected directory: {{ workspace.source.name }}</dd>
            <dd v-else>{{ workspace.source.name }}</dd>
            <dt class="font-medium">Access</dt>
            <dd>Read-only, RAM-only snapshot</dd>
            <dt class="font-medium">Capture window</dt>
            <dd class="break-all">{{ workspace.startedAt }} to {{ workspace.finishedAt }}</dd>
            <dt class="font-medium">Contents</dt>
            <dd>
                {{ workspace.entries.length }} recorded entries; {{ workspace.capturedFiles }} captured files;
                {{ workspace.capturedBytes }} captured bytes
            </dd>
            <dt class="font-medium">Radio identity</dt>
            <dd>Unverified. No board or firmware version has been inferred.</dd>
            <dt class="font-medium">Content validation</dt>
            <dd>Not run. Unknown files and malformed content are retained unchanged.</dd>
        </dl>

        <p v-if="workspace.status === 'incomplete'" role="alert" class="text-error">
            Snapshot incomplete: {{ workspace.issueCount }} issue(s). Some bytes or directory regions were not captured.
            Review the diagnostics; this is not a complete backup.
        </p>
        <p v-else class="text-muted">
            Snapshot complete for the enumerated source. Capture is file-by-file, not an atomic filesystem transaction
            or a validated EdgeTX backup.
        </p>
        <ul v-if="workspace.diagnostics.length" aria-label="Workspace diagnostics" class="space-y-2 text-error">
            <li v-for="(diagnostic, index) in workspace.diagnostics" :key="index">
                {{ diagnostic.path || "(source root)" }}: {{ diagnostic.message }}
            </li>
        </ul>

        <nav aria-label="Workspace operations" class="flex flex-wrap gap-2">
            <UButton :aria-pressed="view === 'inventory'" @click="view = 'inventory'">Inventory</UButton>
            <UButton :aria-pressed="view === 'backup'" @click="view = 'backup'">Backup</UButton>
            <UButton :aria-pressed="view === 'restore'" @click="view = 'restore'">Restore</UButton>
        </nav>

        <section v-if="view === 'inventory'" aria-labelledby="inventory-heading" class="space-y-3">
            <h4 id="inventory-heading" class="font-semibold">Inventory</h4>
            <p v-if="!workspace.entries.length">No entries were found in this source.</p>
            <div v-else class="overflow-x-auto">
                <table aria-label="Workspace inventory" class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-default">
                            <th scope="col" class="p-2">Relative path</th>
                            <th scope="col" class="p-2">Kind</th>
                            <th scope="col" class="p-2">Source size</th>
                            <th scope="col" class="p-2">Capture state</th>
                            <th scope="col" class="p-2">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in visibleEntries" :key="entry.id" class="border-b border-default align-top">
                            <th scope="row" class="max-w-sm break-all p-2 font-medium">
                                {{ entry.path }}
                                <ul v-if="entry.diagnostics.length" class="mt-1 space-y-1 font-normal text-error">
                                    <li v-for="(diagnostic, index) in entry.diagnostics" :key="index">
                                        {{ diagnostic.message }}
                                    </li>
                                </ul>
                            </th>
                            <td class="p-2">{{ entry.kind }}</td>
                            <td class="p-2">
                                <template v-if="entry.kind === 'file'">
                                    {{ entry.size === null ? "Unknown" : `${entry.size} bytes` }}
                                </template>
                                <template v-else>Not applicable</template>
                            </td>
                            <td class="p-2">
                                <template v-if="entry.kind === 'file'">
                                    {{ entry.data ? "Captured, unvalidated" : "Not captured" }}
                                </template>
                                <template v-else>
                                    {{ entry.diagnostics.length ? "Enumeration incomplete" : "Directory recorded" }}
                                </template>
                            </td>
                            <td class="p-2">
                                <UButton
                                    v-if="entry.kind === 'file'"
                                    variant="outline"
                                    color="neutral"
                                    :disabled="busy || !entry.data"
                                    :aria-label="`Download ${entry.path}`"
                                    @click="emit('download', entry)"
                                >
                                    Download original
                                </UButton>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="pageCount > 1" class="flex flex-wrap items-center gap-3">
                <UButton :disabled="page === 0" aria-label="Previous inventory page" @click="page--">Previous</UButton>
                <p>Page {{ page + 1 }} of {{ pageCount }} (100 entries per page)</p>
                <UButton :disabled="page + 1 >= pageCount" aria-label="Next inventory page" @click="page++"
                    >Next</UButton
                >
            </div>
            <p class="text-sm text-muted">
                Downloads use captured bytes, not a fresh read from the source. Save copies outside the radio/SD card.
            </p>
        </section>

        <section v-else-if="view === 'backup'" aria-labelledby="backup-heading" class="space-y-2">
            <h4 id="backup-heading" class="font-semibold">Backup</h4>
            <p>No backup archive has been created. Backup scopes and archive export are subsequent B01/B02 tasks.</p>
            <p v-if="workspace.status === 'incomplete'" class="text-error">
                This incomplete workspace must not be presented as a complete backup.
            </p>
        </section>

        <section v-else aria-labelledby="restore-heading" class="space-y-2">
            <h4 id="restore-heading" class="font-semibold">Restore</h4>
            <p>
                Archive inspection and offline restore are subsequent B03/B04 tasks. Opening this view writes nothing to
                your source or radio.
            </p>
        </section>
    </section>
</template>
