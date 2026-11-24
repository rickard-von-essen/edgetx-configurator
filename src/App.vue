<script setup lang="ts">
import UApp from "@nuxt/ui/components/App.vue";
import AppShell from "./components/AppShell.vue";
import LocalFilesPanel from "./features/local-files/LocalFilesPanel.vue";
</script>

<template>
    <UApp>
        <AppShell title="EdgeTX Configurator">
            <LocalFilesPanel />
        </AppShell>
    </UApp>
</template>
