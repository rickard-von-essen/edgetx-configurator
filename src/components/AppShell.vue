<script setup lang="ts">
defineProps<{
    title: string;
}>();
</script>

<template>
    <main class="min-h-screen bg-default px-6 py-10 text-default">
        <h1 class="text-2xl font-semibold">{{ title }}</h1>
        <div class="mt-6">
            <slot />
        </div>
    </main>
</template>
