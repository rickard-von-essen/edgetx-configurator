import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("keeps malformed/unknown files accessible and navigates without executing backup/restore", async ({ page }) => {
    await page.goto("/");
    const bytes = Buffer.from("header: [\r\n");
    await page.getByLabel("Select files or archives").setInputFiles([
        { name: "broken.yml", mimeType: "text/plain", buffer: bytes },
        { name: "unknown.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 255, 13, 10]) },
    ]);
    const inventory = page.getByRole("table", { name: "Workspace inventory" });
    await expect(inventory).toContainText("broken.yml");
    await expect(inventory).toContainText("unknown.bin");
    await expect(inventory).toContainText("Captured, unvalidated");
    await expect(page.getByText("Unverified. No board or firmware version has been inferred.")).toBeVisible();
    await page.getByRole("button", { name: "Backup", exact: true }).click();
    await expect(page.getByText("No backup archive has been created.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText("Opening this view writes nothing", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    const requested = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download broken.yml" }).click();
    const downloaded = await requested;
    const path = await downloaded.path();
    if (!path) throw new Error("Missing downloaded file.");
    expect(readFileSync(path)).toEqual(bytes);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Raw workspace" })).toHaveCount(0);
});

test("records failed files and keeps the inventory explicitly incomplete", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", {
            configurable: true,
            value: async () => ({
                kind: "directory",
                name: "READ-FAILURE",
                async *values() {
                    yield {
                        kind: "file",
                        name: "denied.bin",
                        async getFile() {
                            throw new DOMException("Test read failure", "NotAllowedError");
                        },
                    };
                    yield {
                        kind: "file",
                        name: "retained.bin",
                        async getFile() {
                            return new File(["retained"], "retained.bin");
                        },
                    };
                },
            }),
        });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Select directory (read-only)" }).click();
    await expect(page.getByRole("alert")).toContainText("Snapshot incomplete");
    const inventory = page.getByRole("table", { name: "Workspace inventory" });
    await expect(inventory).toContainText("denied.bin");
    await expect(inventory).toContainText("retained.bin");
    await expect(inventory).toContainText("Permission denied");
    await expect(page.getByRole("button", { name: "Download denied.bin" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Download retained.bin" })).toBeEnabled();
});

test("cancels a pending source read without replacing the existing workspace", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", {
            configurable: true,
            value: async () => ({
                kind: "directory",
                name: "PENDING",
                async *values() {
                    yield {
                        kind: "file",
                        name: "new.bin",
                        async getFile() {
                            return new Promise<File>((resolve) => {
                                document.addEventListener(
                                    "release-test-file",
                                    () => resolve(new File(["new"], "new.bin")),
                                    {
                                        once: true,
                                    },
                                );
                            });
                        },
                    };
                },
            }),
        });
    });
    await page.goto("/");
    await page.getByLabel("Select files or archives").setInputFiles({
        name: "old.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("old"),
    });
    const inventory = page.getByRole("table", { name: "Workspace inventory" });
    await expect(inventory).toContainText("old.bin");
    await page.getByRole("button", { name: "Select directory (read-only)" }).click();
    await page.getByRole("button", { name: "Cancel capture" }).click();
    await page.evaluate(() => document.dispatchEvent(new Event("release-test-file")));
    await expect(page.getByRole("status")).toContainText("Workspace capture cancelled");
    await expect(inventory).toContainText("old.bin");
    await expect(inventory).not.toContainText("new.bin");
    await expect(page.getByRole("button", { name: "Select directory (read-only)" })).toBeEnabled();
});

test("captures nested native filesystem bytes independently of later source changes", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Native directory adapter targets supporting Chromium browsers.");
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", {
            configurable: true,
            value: async (options: { mode: string }) => {
                if (options.mode !== "read") throw new Error("Unexpected write permission request.");
                const root = await navigator.storage.getDirectory();
                const source = await root.getDirectoryHandle("SNAPSHOT-SOURCE", { create: true });
                const models = await source.getDirectoryHandle("MODELS", { create: true });
                await models.getDirectoryHandle("EMPTY", { create: true });
                const model = await models.getFileHandle("model00.yml", { create: true });
                const writer = await model.createWritable();
                await writer.write("header: [\r\n");
                await writer.close();
                return source;
            },
        });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Select directory (read-only)" }).click();
    const inventory = page.getByRole("table", { name: "Workspace inventory" });
    await expect(inventory).toContainText("MODELS/model00.yml");
    await expect(inventory).toContainText("MODELS/EMPTY");
    const original = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const source = await root.getDirectoryHandle("SNAPSHOT-SOURCE");
        const models = await source.getDirectoryHandle("MODELS");
        const model = await models.getFileHandle("model00.yml");
        const before = await (await model.getFile()).text();
        const writer = await model.createWritable();
        await writer.write("changed after capture");
        await writer.close();
        return before;
    });
    expect(original).toBe("header: [\r\n");
    const requested = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download MODELS/model00.yml" }).click();
    const path = await (await requested).path();
    if (!path) throw new Error("Missing captured download.");
    expect(readFileSync(path)).toEqual(Buffer.from(original));
});
