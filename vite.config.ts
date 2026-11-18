import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

export default defineConfig({
    plugins: [
        vue(),
        ui({
            autoImport: false,
            components: false,
            dts: false,
            router: false,
            colorMode: false,
        }),
    ],
    server: {
        strictPort: true,
    },
    preview: {
        strictPort: true,
    },
    test: {
        environment: "jsdom",
        include: ["tests/unit/**/*.test.ts"],
    },
});
