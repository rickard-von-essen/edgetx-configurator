import { expect, test } from "@playwright/test";

test("loads and reloads the application without errors", async ({ page, baseURL }) => {
    if (!baseURL) {
        throw new Error("The smoke suite requires a configured baseURL.");
    }

    const origin = new URL(baseURL).origin;
    const failures: string[] = [];

    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error" || (message.type() === "warning" && message.text().includes("[Vue warn]"))) {
            failures.push(message.text());
        }
    });
    page.on("requestfailed", (request) => {
        if (new URL(request.url()).origin === origin) {
            failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
        }
    });
    page.on("response", (response) => {
        if (new URL(response.url()).origin === origin && response.status() >= 400) {
            failures.push(`${response.status()} ${response.url()}`);
        }
    });

    const response = await page.goto("/");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle("EdgeTX Configurator");
    const heading = page.getByRole("main").getByRole("heading", { name: "EdgeTX Configurator", level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-weight", "600");

    const reloaded = await page.reload();

    // Firefox may revalidate the cached document instead of downloading it again.
    expect([200, 304]).toContain(reloaded?.status());
    await expect(heading).toBeVisible();
    expect(failures).toEqual([]);
});
