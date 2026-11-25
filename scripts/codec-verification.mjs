import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = resolve(root, "tests/fixtures/pocket-2.12.4");
const outputDirectory = resolve(root, "test-results/f04-companion");
const profileId = "pocket-elrs-2.12.4";
const args = process.argv.slice(2);
const compare = args[0] === "--compare" ? args[1] : undefined;
if ((args.length && !compare) || (compare && args.length !== 2)) {
    throw new Error("Usage: npm run codec:fixtures OR npm run codec:compare -- /path/to/private-exports");
}

const expected = [
    { path: ["header", "name"], value: "CodecTest" },
    { path: ["timers", 0, "name"], value: "Tst" },
    { path: ["timers", 0, "mode"], value: "ON" },
    { path: ["timers", 0, "start"], value: "60" },
    { path: ["mixData", 0, "weight"], value: "75" },
    { path: ["mixData", 0, "srcRaw"], value: "I1" },
    { path: ["mixData", 0, "swtch"], value: "SB1" },
    { path: ["mixData", 0, "flightModes"], value: "000000000" },
];

function assertQualified(document) {
    if (document.mode !== "verification-only") {
        throw new Error(
            `Native verification input is not qualified: ${document.diagnostics.map((item) => item.code).join(", ")}`,
        );
    }
}

const manifest = JSON.parse(await readFile(resolve(corpus, "manifest.json"), "utf8"));
async function fixture(path) {
    const bytes = await readFile(resolve(corpus, path));
    const record = manifest.files.find((entry) => entry.path === path);
    if (!record || createHash("sha256").update(bytes).digest("hex") !== record.sha256) {
        throw new Error(`Reviewed fixture fingerprint mismatch: ${path}`);
    }
    return bytes;
}

// Use the existing TS transform so this tool exercises the same codec as the tests/app.
const server = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
});
try {
    const { inspectNativeYaml } = await server.ssrLoadModule("/src/domain/edgetx/nativeYaml.ts");
    if (compare) {
        for (const origin of ["native", "companion"]) {
            const name = `${origin}-companion-export.yml`;
            const document = inspectNativeYaml(await readFile(resolve(compare, name)), { profileId });
            assertQualified(document);
            for (const field of expected) {
                if (document.scalarText(field.path) !== field.value) {
                    throw new Error(`Companion export ${name} did not retain qualified field ${field.path.join(".")}.`);
                }
            }
            console.log(`Qualified field comparison passed: ${name}`);
        }
        console.log("This compares model fields only; Companion must also open each archive without warnings.");
    } else {
        const files = [];
        for (const origin of ["native", "companion"]) {
            const modelBytes = await fixture(`${origin}/MODELS/model07.yml`);
            const text = new TextDecoder().decode(modelBytes);
            const eol = text.includes("\r\n") ? "\r\n" : "\n";
            const syntheticTimer = [
                "timers:",
                "  0:",
                "    swtch: NONE",
                "    mode: ON",
                "    name: Tst",
                "    minuteBeep: 0",
                "    countdownBeep: 0",
                "    start: 30",
                "    persistent: 0",
                "    countdownStart: 0",
                "    value: 0",
                "    showElapsed: 0",
                "    extraHaptic: 0",
                "",
            ].join(eol);
            const seeded = new TextEncoder().encode(text + (text.endsWith("\n") ? "" : eol) + syntheticTimer);
            const model = inspectNativeYaml(seeded, { profileId });
            assertQualified(model);
            const candidateModel = model.companionVerificationCandidate([
                { path: ["header", "name"], value: "CodecTest" },
                { path: ["timers", 0, "start"], value: 60 },
                { path: ["mixData", 0, "weight"], value: 75 },
                { path: ["mixData", 0, "srcRaw"], value: "I1" },
                { path: ["mixData", 0, "swtch"], value: "SB1" },
            ]);
            const radio = inspectNativeYaml(await fixture(`${origin}/RADIO/radio.yml`), { profileId });
            assertQualified(radio);
            const candidateRadio = radio.companionVerificationCandidate([{ path: ["speakerVolume"], value: 4 }]);
            const mtime = new Date(1980, 0, 1, 0, 0, 0);
            const archive = zipSync(
                {
                    "RADIO/radio.yml": [candidateRadio, { level: 0, mtime }],
                    "MODELS/model07.yml": [candidateModel, { level: 0, mtime }],
                },
                { level: 0, mtime },
            );
            files.push(
                [`${origin}-candidate.etx`, archive],
                [`${origin}-candidate-model.yml`, candidateModel],
                [`${origin}-candidate-radio.yml`, candidateRadio],
            );
        }
        files.push([
            "expected.json",
            JSON.stringify(
                {
                    profileId,
                    syntheticTimerSeed:
                        "A new timer 0 starts at 30 seconds; the codec changes its existing start scalar to 60.",
                    expectedModelFields: expected,
                    expectedRadioSpeakerVolume: { nativeValue: 4, companionSliderValue: 16 },
                    warning: "TEST ONLY. Synthetic calibration. Never write these files to a radio.",
                    companionExports: ["native-companion-export.yml", "companion-companion-export.yml"],
                },
                null,
                2,
            ) + "\n",
        ]);
        await mkdir(outputDirectory, { recursive: true });
        for (const [name, bytes] of files) await writeFile(resolve(outputDirectory, name), bytes);
        console.log(`Created test-only verification artifacts in ${outputDirectory}`);
        console.log("Open both *-candidate.etx files in Companion 2.12.4; never write them to a radio.");
        console.log(
            "Export each CodecTest model outside the repository as native-companion-export.yml / companion-companion-export.yml.",
        );
    }
} finally {
    await server.close();
}
