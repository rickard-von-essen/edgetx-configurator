import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const archive = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/pocket-2.12.4/companion/pocket.etx"),
);
const upload = { name: "pocket.etx", mimeType: "application/zip", buffer: archive };

test("imports and downloads an opaque archive through the cross-browser file fallback", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined });
    });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Select directory (read-only)" })).toBeDisabled();
    await expect(page.getByText("This browser does not support directory access.")).toBeVisible();
    await page.getByLabel("Select files or archives").setInputFiles(upload);
    await expect(page.getByRole("table", { name: "Workspace inventory" })).toContainText("pocket.etx");
    const requested = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download pocket.etx" }).click();
    const download = await requested;
    expect(download.suggestedFilename()).toBe("pocket.etx");
    const path = await download.path();
    if (!path) throw new Error("The browser did not provide the completed download.");
    expect(readFileSync(path)).toEqual(archive);
    await expect(page.getByRole("status")).toContainText("Download requested");
    await expect(page.getByRole("status")).toContainText("cannot be confirmed");

    await page.getByRole("button", { name: "Close workspace" }).click();
    await expect(page.getByRole("table", { name: "Workspace inventory" })).toHaveCount(0);
});

for (const [name, message, role] of [
    ["NotAllowedError", "Permission denied", "alert"],
    ["AbortError", "Selection cancelled", "status"],
] as const) {
    test(`surfaces ${name} without losing a prior selection`, async ({ page }) => {
        await page.addInitScript((errorName) => {
            Object.defineProperty(window, "showDirectoryPicker", {
                configurable: true,
                value: async () => {
                    throw new DOMException("Test picker result", errorName);
                },
            });
        }, name);
        await page.goto("/");
        await page.getByLabel("Select files or archives").setInputFiles(upload);
        await expect(page.getByRole("table", { name: "Workspace inventory" })).toBeVisible();
        await page.getByRole("button", { name: "Select directory (read-only)" }).click();

        await expect(page.getByRole(role)).toContainText(message);
        await expect(page.getByRole("table", { name: "Workspace inventory" })).toContainText("pocket.etx");
        await expect(page.getByRole("button", { name: "Select directory (read-only)" })).toBeEnabled();
        await expect(page.getByText("Selected directory:", { exact: false })).toHaveCount(0);
    });
}

test("adapts a real Chromium filesystem directory with read-only picker options", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Native directory selection targets supporting Chromium browsers.");
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", {
            configurable: true,
            value: async (options: { mode: string }) => {
                if (options.mode !== "read") throw new Error("Directory selection requested write permission.");
                const root = await navigator.storage.getDirectory();
                return root.getDirectoryHandle("SD-COPY", { create: true });
            },
        });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Select directory (read-only)" }).click();

    await expect(page.getByText("Selected directory: SD-COPY")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/read-only/i);
    await expect(page.getByRole("button", { name: "Select directory (read-only)" })).toBeEnabled();
});
