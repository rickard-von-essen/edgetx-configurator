import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import LocalFilesPanel from "../../src/features/local-files/LocalFilesPanel.vue";
import * as browserStorage from "../../src/services/storage/browser";
import { LocalAccessError } from "../../src/services/storage/local";
import { memoryDirectory } from "./helpers/memoryStorage";
import * as workspaceStorage from "../../src/features/workspaces/workspace";
import type { LocalDirectory } from "../../src/services/storage/local";

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

function panel() {
    return mount(LocalFilesPanel, {
        global: {
            stubs: { UButton: { template: "<button><slot /></button>" } },
        },
    });
}

beforeEach(() => {
    vi.spyOn(browserStorage, "directoryCapability").mockReturnValue({
        available: true,
        reason: "Read-only directory access",
    });
});

describe("LocalFilesPanel", () => {
    it("keeps file selection/download available when directory APIs are unsupported", async () => {
        vi.mocked(browserStorage.directoryCapability).mockReturnValue({
            available: false,
            reason: "Select files or archives instead.",
        });
        const wrapper = panel();
        const input = wrapper.get<HTMLInputElement>("input[type=file]");
        const file = new File(["original\r\n"], "radio.yml");
        Object.defineProperty(input.element, "files", { configurable: true, value: [file] });
        const download = vi.spyOn(browserStorage, "downloadOriginal").mockResolvedValue();

        expect(wrapper.findAll("button")[0]?.attributes("disabled")).toBeDefined();
        await input.trigger("change");
        await vi.waitFor(() => expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("radio.yml"));
        await wrapper.get('button[aria-label="Download radio.yml"]').trigger("click");
        await flushPromises();

        expect(download).toHaveBeenCalledOnce();
        const downloaded = download.mock.calls[0]?.[0];
        expect(await downloaded?.getBlob()).not.toBe(file);
        expect(wrapper.get('[role="status"]').text()).toContain("Download requested");
        expect(wrapper.get('[role="status"]').text()).toContain("cannot be confirmed");
    });

    it("retains the selection on cancellation and clears it only when requested", async () => {
        const wrapper = panel();
        const input = wrapper.get<HTMLInputElement>("input[type=file]");
        Object.defineProperty(input.element, "files", { value: [new File(["zip"], "backup.zip")] });
        await input.trigger("change");
        await vi.waitFor(() => expect(wrapper.find('[aria-label="Workspace inventory"]').exists()).toBe(true));
        vi.spyOn(browserStorage, "selectDirectory").mockRejectedValue(
            new LocalAccessError("cancelled", "Selection cancelled."),
        );

        await wrapper.findAll("button")[0]!.trigger("click");
        await flushPromises();

        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("backup.zip");
        expect(wrapper.get('[role="status"]').text()).toBe("Selection cancelled.");
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Close workspace")!
            .trigger("click");
        expect(wrapper.find('[aria-label="Workspace inventory"]').exists()).toBe(false);
        expect(wrapper.get('[role="status"]').text()).toContain("Workspace closed");
    });

    it("surfaces permission failures without claiming a radio connection or replacing the selection", async () => {
        const wrapper = panel();
        vi.spyOn(browserStorage, "selectDirectory").mockRejectedValue(
            new LocalAccessError("denied", "Permission denied. Select the folder again."),
        );

        await wrapper.findAll("button")[0]!.trigger("click");
        await flushPromises();

        expect(wrapper.get('[role="alert"]').text()).toContain("Permission denied");
        expect(wrapper.text()).not.toContain("Selected directory:");
        expect(wrapper.text()).not.toContain("Connected");
    });

    it("shows a successful read-only directory selection and releases busy state", async () => {
        vi.spyOn(browserStorage, "selectDirectory").mockResolvedValue(memoryDirectory("SD-COPY", []));
        const wrapper = panel();

        await wrapper.findAll("button")[0]!.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("Selected directory: SD-COPY");
        expect(wrapper.get('[role="status"]').text()).toMatch(/read-only/i);
        expect(wrapper.findAll("button")[0]?.attributes("disabled")).toBeUndefined();
    });

    it("keeps the previous workspace when an in-progress capture is cancelled", async () => {
        const wrapper = panel();
        const input = wrapper.get<HTMLInputElement>("input[type=file]");
        Object.defineProperty(input.element, "files", { configurable: true, value: [new File(["old"], "old.bin")] });
        await input.trigger("change");
        await vi.waitFor(() => expect(wrapper.find('[aria-label="Workspace inventory"]').exists()).toBe(true));
        vi.spyOn(workspaceStorage, "captureWorkspace").mockImplementation(
            (_source, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener("abort", () =>
                        reject(new LocalAccessError("cancelled", "Workspace capture cancelled.")),
                    );
                }),
        );
        Object.defineProperty(input.element, "files", { value: [new File(["new"], "new.bin")] });
        await input.trigger("change");
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Cancel capture")!
            .trigger("click");
        await flushPromises();

        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("old.bin");
        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).not.toContain("new.bin");
        expect(wrapper.get('[role="status"]').text()).toContain("capture cancelled");
        expect(wrapper.findAll("button")[0]?.attributes("disabled")).toBeUndefined();
    });

    it("exposes unreadable entries and an incomplete workspace instead of a successful backup", async () => {
        vi.spyOn(browserStorage, "selectDirectory").mockResolvedValue(
            memoryDirectory("SD", [
                {
                    kind: "unreadable-file",
                    name: "missing.bin",
                    error: new LocalAccessError("denied", "Permission denied."),
                },
            ]),
        );
        const wrapper = panel();
        await wrapper.findAll("button")[0]!.trigger("click");
        await flushPromises();

        expect(wrapper.get('[role="alert"]').text()).toContain("Snapshot incomplete");
        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("missing.bin");
        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("Permission denied");
        expect(wrapper.get('button[aria-label="Download missing.bin"]').attributes("disabled")).toBeDefined();
    });

    it("does not capture a picker result after the panel is unmounted", async () => {
        let resolveDirectory: ((directory: LocalDirectory) => void) | undefined;
        vi.spyOn(browserStorage, "selectDirectory").mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveDirectory = resolve;
                }),
        );
        const capture = vi.spyOn(workspaceStorage, "captureWorkspace");
        const wrapper = panel();
        await wrapper.findAll("button")[0]!.trigger("click");
        wrapper.unmount();
        if (!resolveDirectory) throw new Error("The picker did not start.");
        resolveDirectory(memoryDirectory("SD", []));
        await flushPromises();

        expect(capture).not.toHaveBeenCalled();
    });
});
