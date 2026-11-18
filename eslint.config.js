import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
    globalIgnores(["dist/**", "coverage/**", "playwright-report/**", "test-results/**"]),
    js.configs.recommended,
    {
        files: ["**/*.{ts,vue}"],
        extends: [tseslint.configs.recommended],
    },
    vue.configs["flat/recommended"],
    {
        files: ["**/*.vue"],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },
    {
        files: ["src/**/*.{ts,vue}", "tests/unit/**/*.ts"],
        languageOptions: {
            globals: globals.browser,
        },
    },
    {
        files: ["*.{js,ts}", "tests/smoke/**/*.ts"],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        files: ["**/*.{ts,vue}"],
        rules: {
            "no-undef": "off",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": "error",
        },
    },
    prettier,
]);
