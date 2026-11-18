import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import AppShell from "../../src/components/AppShell.vue";

enableAutoUnmount(afterEach);

describe("AppShell", () => {
    it("renders the supplied title as the page heading", () => {
        const wrapper = mount(AppShell, { props: { title: "Model editor" } });

        expect(wrapper.get("main h1").text()).toBe("Model editor");
    });

    it("updates the heading when the title changes", async () => {
        const wrapper = mount(AppShell, { props: { title: "Model editor" } });

        await wrapper.setProps({ title: "Radio settings" });

        expect(wrapper.get("main h1").text()).toBe("Radio settings");
    });

    it("renders supplied content inside the main landmark", () => {
        const wrapper = mount(AppShell, {
            props: { title: "Model editor" },
            slots: { default: "<p>Choose a model to edit.</p>" },
        });

        expect(wrapper.get("main p").text()).toBe("Choose a model to edit.");
    });
});
