import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import LocalFilesPanel from "../../src/features/local-files/LocalFilesPanel.vue";
import * as browserStorage from "../../src/services/storage/browser";
import { LocalAccessError } from "../../src/services/storage/local";
import { memoryDirectory } from "./helpers/memoryStorage";

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
        expect(wrapper.get('[aria-label="Selected files"]').text()).toContain("radio.yml");
        await wrapper.get('button[aria-label="Download radio.yml"]').trigger("click");
        await flushPromises();

        expect(download).toHaveBeenCalledOnce();
        expect(wrapper.get('[role="status"]').text()).toContain("Download requested");
        expect(wrapper.get('[role="status"]').text()).toContain("cannot be confirmed");
    });

    it("retains the selection on cancellation and clears it only when requested", async () => {
        const wrapper = panel();
        const input = wrapper.get<HTMLInputElement>("input[type=file]");
        Object.defineProperty(input.element, "files", { value: [new File(["zip"], "backup.zip")] });
        await input.trigger("change");
        vi.spyOn(browserStorage, "selectDirectory").mockRejectedValue(
            new LocalAccessError("cancelled", "Selection cancelled."),
        );

        await wrapper.findAll("button")[0]!.trigger("click");
        await flushPromises();

        expect(wrapper.get('[aria-label="Selected files"]').text()).toContain("backup.zip");
        expect(wrapper.get('[role="status"]').text()).toBe("Selection cancelled.");
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Clear selection")!
            .trigger("click");
        expect(wrapper.find('[aria-label="Selected files"]').exists()).toBe(false);
        expect(wrapper.get('[role="status"]').text()).toContain("Selection cleared");
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
        expect(wrapper.get('[role="status"]').text()).toContain("read-only");
        expect(wrapper.findAll("button")[0]?.attributes("disabled")).toBeUndefined();
    });
});
