import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import WorkspacePanel from "../../src/features/workspaces/WorkspacePanel.vue";
import { captureWorkspace } from "../../src/features/workspaces/workspace";
import type { RawWorkspace } from "../../src/features/workspaces/workspace";
import { memoryFile } from "./helpers/memoryStorage";

enableAutoUnmount(afterEach);

function panel(workspace: RawWorkspace) {
    return mount(WorkspacePanel, {
        props: { workspace, busy: false },
        global: { stubs: { UButton: { template: "<button><slot /></button>" } } },
    });
}

describe("WorkspacePanel", () => {
    it("navigates inventory/backup/restore without claiming that a backup or restore ran", async () => {
        const workspace = await captureWorkspace({
            kind: "files",
            name: "Files",
            files: [memoryFile("broken.yml", ["header: ["])],
        });
        const wrapper = panel(workspace);
        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("broken.yml");
        expect(wrapper.text()).toContain("Not run. Unknown files and malformed content are retained unchanged.");
        expect(wrapper.text()).toContain("Unverified");

        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Backup")!
            .trigger("click");
        expect(wrapper.text()).toContain("No backup archive has been created");
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Restore")!
            .trigger("click");
        expect(wrapper.text()).toContain("Opening this view writes nothing");
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Inventory")!
            .trigger("click");
        await wrapper.get('button[aria-label="Download broken.yml"]').trigger("click");
        expect(wrapper.emitted("download")?.[0]?.[0]).toBe(workspace.entries[0]);
    });

    it("paginates without hiding entries permanently and resets navigation for a new workspace", async () => {
        const workspace = await captureWorkspace({
            kind: "files",
            name: "Many files",
            files: Array.from({ length: 101 }, (_, index) => memoryFile(`file-${index}`, [])),
        });
        const wrapper = panel(workspace);
        expect(wrapper.findAll("tbody tr")).toHaveLength(100);
        await wrapper.get('[aria-label="Next inventory page"]').trigger("click");
        expect(wrapper.findAll("tbody tr")).toHaveLength(1);
        expect(wrapper.get("tbody").text()).toContain("file-100");
        await wrapper
            .findAll("button")
            .find((button) => button.text() === "Backup")!
            .trigger("click");
        const next = await captureWorkspace({ kind: "files", name: "Next", files: [memoryFile("next", [])] });
        await wrapper.setProps({ workspace: next });
        expect(wrapper.get('[aria-label="Workspace inventory"]').text()).toContain("next");
        expect(wrapper.find('[aria-label="Next inventory page"]').exists()).toBe(false);
    });
});
