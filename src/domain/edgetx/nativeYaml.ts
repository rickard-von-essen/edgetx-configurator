import { isAlias, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { Document, Node, Scalar } from "yaml";
import { inspectRadioChecksum, replaceRadioChecksum } from "./checksum";
import { decodeField, encodeField, fieldRule, NativeCodecError } from "./fields";
import type { NativeField, NativeKind, NativePath } from "./fields";
import { POCKET_2_12_4 as profile } from "./profile";

export const NATIVE_YAML_LIMITS = Object.freeze({ bytes: 1024 * 1024, nodes: 50_000, containers: 64 });

export interface NativeDiagnostic {
    readonly code: string;
    readonly message: string;
    readonly path?: NativePath;
}

export interface NativeEdit {
    readonly path: NativePath;
    readonly value: string | number;
}

export interface NativeDocument {
    readonly kind: NativeKind;
    readonly version: string | undefined;
    readonly board: string | undefined;
    readonly mode: "read-only" | "verification-only";
    readonly radioWritesQualified: false;
    readonly diagnostics: readonly NativeDiagnostic[];
    originalBytes(): Uint8Array<ArrayBuffer>;
    scalarText(path: NativePath): string | undefined;
    field(path: NativePath): NativeField;
    companionVerificationCandidate(edits: readonly NativeEdit[]): Uint8Array<ArrayBuffer>;
}

function issue(code: string, message: string, path?: NativePath): NativeDiagnostic {
    return Object.freeze({ code, message, path: path ? Object.freeze([...path]) : undefined });
}

function nodeAt(document: Document | undefined, path: NativePath): unknown {
    if (path.length > NATIVE_YAML_LIMITS.containers) {
        throw new NativeCodecError("path-limit", "The requested field path is too deep.", path);
    }
    let node: unknown = document?.contents;
    for (const part of path) {
        if (isMap(node)) {
            node = node.get(String(part), true);
        } else if (isSeq(node) && /^(0|[1-9]\d*)$/.test(String(part))) {
            node = node.get(Number(part), true);
        } else {
            return undefined;
        }
    }
    return node;
}

function scalarText(document: Document | undefined, path: NativePath): string | undefined {
    const node = nodeAt(document, path);
    return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

interface ScalarRecord {
    readonly path: NativePath;
    readonly node: Scalar;
}

function scanStructure(document: Document, kind: NativeKind, owned: ScalarRecord[]): NativeDiagnostic | undefined {
    const stack: { node: Node; path: NativePath; depth: number }[] = [];
    if (isNode(document.contents)) stack.push({ node: document.contents, path: [], depth: 1 });
    let count = 0;
    function feature(node: Node, path: NativePath): NativeDiagnostic | undefined {
        if (isAlias(node) || ("anchor" in node && node.anchor)) {
            return issue(
                "unsupported-alias",
                "Anchors and aliases are retained as read-only data, never expanded.",
                path,
            );
        }
        if (node.tag)
            return issue("unsupported-tag", "Explicit YAML tags are outside the qualified native subset.", path);
        return undefined;
    }
    function push(node: unknown, path: NativePath, depth: number): NativeDiagnostic | undefined {
        if (!isNode(node)) return undefined;
        if (count + stack.length >= NATIVE_YAML_LIMITS.nodes) {
            return issue("node-limit", "The native YAML node limit was exceeded.");
        }
        stack.push({ node, path, depth });
        return undefined;
    }
    while (stack.length) {
        const frame = stack.pop();
        if (!frame) break;
        const { node, path, depth } = frame;
        count++;
        const unsupported = feature(node, path);
        if (unsupported) return unsupported;
        if ((isMap(node) || isSeq(node)) && depth > NATIVE_YAML_LIMITS.containers) {
            return issue("depth-limit", "The native YAML container-depth limit was exceeded.", path);
        }
        if (isMap(node)) {
            const keys = new Set<string>();
            for (const pair of node.items) {
                if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
                    return issue("unsupported-key", "Only scalar string mapping keys are qualified.", path);
                }
                if (count + stack.length >= NATIVE_YAML_LIMITS.nodes) {
                    return issue("node-limit", "The native YAML node limit was exceeded.");
                }
                count++;
                const keyIssue = feature(pair.key, path);
                if (keyIssue) return keyIssue;
                if (pair.key.value === "<<") {
                    return issue("unsupported-merge", "YAML merge keys are outside the qualified native subset.", path);
                }
                if (keys.has(pair.key.value)) {
                    return issue("duplicate-key", "Duplicate mapping keys make this document ambiguous.", path);
                }
                keys.add(pair.key.value);
                const childIssue = push(pair.value, [...path, pair.key.value], depth + 1);
                if (childIssue) return childIssue;
            }
        } else if (isSeq(node)) {
            for (let index = 0; index < node.items.length; index++) {
                const childIssue = push(node.items[index], [...path, index], depth + 1);
                if (childIssue) return childIssue;
            }
        } else if (isScalar(node) && fieldRule(kind, path)) {
            owned.push({ node, path });
        }
    }
    return undefined;
}

function inspectContainers(document: Document, kind: NativeKind): NativeDiagnostic | undefined {
    if (kind !== "model") return undefined;
    if (!isMap(nodeAt(document, ["header"])) || scalarText(document, ["header", "name"]) === undefined) {
        return issue("unsupported-header", "A model requires a scalar header.name field.");
    }
    for (const [name, maximum] of [
        ["mixData", profile.mixCount],
        ["expoData", profile.inputLineCount],
    ] as const) {
        const collection = nodeAt(document, [name]);
        if (collection === undefined) continue;
        if (!isSeq(collection) || collection.items.length > maximum || collection.items.some((node) => !isMap(node))) {
            return issue("unsupported-collection", `${name} must be a sequence of at most ${maximum} mappings.`, [
                name,
            ]);
        }
    }
    const timers = nodeAt(document, ["timers"]);
    if (timers !== undefined) {
        if (!isMap(timers) || timers.items.length > profile.timerCount) {
            return issue("unsupported-timers", "Timers must use a supported numbered mapping.", ["timers"]);
        }
        for (const pair of timers.items) {
            if (
                !isScalar(pair.key) ||
                typeof pair.key.value !== "string" ||
                !/^(0|[1-9]\d*)$/.test(pair.key.value) ||
                Number(pair.key.value) >= profile.timerCount ||
                !isMap(pair.value)
            ) {
                return issue(
                    "unsupported-timers",
                    `Timer keys must be canonical zero-based slots 0 through ${profile.timerCount - 1}.`,
                    ["timers"],
                );
            }
        }
    }
    return undefined;
}

export function inspectNativeYaml(bytes: Uint8Array, options: { readonly profileId?: string } = {}): NativeDocument {
    const original = new Uint8Array(bytes);
    const profileId = options.profileId;
    let text: string | undefined;
    let document: Document | undefined;
    let problem: NativeDiagnostic | undefined;
    let kind: NativeKind = "unknown";
    const owned: ScalarRecord[] = [];

    if (original.byteLength > NATIVE_YAML_LIMITS.bytes) {
        problem = issue("byte-limit", "Native YAML inspection is limited to 1 MiB; original bytes remain available.");
    } else {
        try {
            text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original);
        } catch {
            problem = issue("invalid-encoding", "Native YAML inspection requires valid UTF-8.");
        }
    }
    if (!problem && text !== undefined) {
        if (text.startsWith("\ufeff")) {
            problem = issue("unsupported-bom", "BOM-prefixed documents are not qualified for candidate edits.");
        } else if (/^(?:%|---(?:\s|$)|\.\.\.(?:\s|$))/m.test(text)) {
            problem = issue("unsupported-directive", "YAML directives/document markers are not qualified.");
        } else {
            try {
                document = parseDocument(text, {
                    schema: "failsafe",
                    version: "1.2",
                    stringKeys: true,
                    keepSourceTokens: true,
                    prettyErrors: false,
                    // Duplicate checks below are linear and never convert mappings to JS objects.
                    uniqueKeys: false,
                });
            } catch {
                problem = issue("parser-failure", "The YAML parser could not safely inspect this document.");
            }
        }
    }
    if (!problem && document) {
        if (document.errors.length) {
            problem = issue("invalid-yaml", `Invalid YAML (${document.errors[0]?.code}).`);
        } else if (document.warnings.length) {
            problem = issue("unsupported-yaml", `Unsupported YAML feature (${document.warnings[0]?.code}).`);
        } else if (!document.contents) {
            problem = issue("empty-document", "The native document is empty.");
        } else if (!isMap(document.contents)) {
            problem = issue("unsupported-root", "Native documents require a root mapping.");
        } else {
            const header = document.has("header");
            const board = document.has("board");
            if (header !== board) kind = header ? "model" : "radio";
            problem = scanStructure(document, kind, owned);
        }
    }
    const version = scalarText(document, ["semver"]);
    const board = scalarText(document, ["board"]);
    if (!problem) {
        if (kind === "unknown") {
            problem = issue(
                "unsupported-kind",
                "The document is not an unambiguous supported model or radio document.",
            );
        } else if (version !== profile.version) {
            problem = issue("unsupported-version", "Only the pinned native v2.12.4 format is qualified.");
        } else if (profileId !== profile.id) {
            problem = issue(
                "target-profile-required",
                "Explicitly select the Pocket ELRS v2.12.4 profile; no target is inferred.",
            );
        } else if (kind === "radio" && board !== profile.board) {
            problem = issue("unsupported-board", "The radio board does not match the explicitly selected profile.");
        } else if (kind === "radio" && scalarText(document, ["internalModule"]) !== profile.internalModule) {
            problem = issue(
                "unsupported-rf-configuration",
                "The configured internal module does not match the selected ELRS profile.",
            );
        } else if (
            kind === "radio" &&
            nodeAt(document, ["manuallyEdited"]) !== undefined &&
            scalarText(document, ["manuallyEdited"]) !== "0"
        ) {
            problem = issue(
                "manual-edit-marker",
                "Manually edited radio settings require review before candidate edits.",
            );
        } else {
            problem = document
                ? inspectContainers(document, kind)
                : issue("invalid-yaml", "No parsed native document.");
        }
    }
    if (!problem && kind === "radio") {
        const checksum = inspectRadioChecksum(original);
        if (!checksum) {
            problem = issue("unsupported-checksum", "Radio settings need a qualified first-line checksum header.");
        } else if (checksum.declared !== checksum.computed) {
            problem = issue("checksum-mismatch", "The radio settings checksum does not match the original bytes.");
        }
    }
    if (!problem) {
        for (const { node, path } of owned) {
            const rule = fieldRule(kind, path);
            if (!rule || typeof node.value !== "string") {
                problem = issue("unsupported-scalar", "An owned field is not a qualified scalar.", path);
                break;
            }
            if (
                !node.range ||
                text?.slice(node.range[0], node.range[1]).includes("\n") ||
                (rule.kind === "text" && node.type === "PLAIN" && /^null$/i.test(node.value))
            ) {
                problem = issue(
                    "unsupported-scalar-style",
                    "An owned field uses an unqualified scalar representation.",
                    path,
                );
                break;
            }
            try {
                decodeField(rule, node.value, path);
            } catch (error) {
                if (!(error instanceof NativeCodecError)) throw error;
                problem = issue(error.code, error.message, path);
                break;
            }
        }
    }
    const diagnostics = Object.freeze(problem ? [problem] : []);
    const mode = problem ? "read-only" : "verification-only";

    return Object.freeze({
        kind,
        version,
        board,
        mode,
        radioWritesQualified: false,
        diagnostics,
        originalBytes() {
            return new Uint8Array(original);
        },
        scalarText(path: NativePath) {
            return scalarText(document, path);
        },
        field(path: NativePath) {
            if (problem)
                throw new NativeCodecError(
                    "read-only-document",
                    "This document has no qualified typed field view.",
                    path,
                );
            const rule = fieldRule(kind, path);
            const raw = scalarText(document, path);
            if (!rule) throw new NativeCodecError("unowned-field", "This native field remains opaque.", path);
            if (raw === undefined)
                throw new NativeCodecError("missing-field", "The scalar is absent; defaults are not inserted.", path);
            return decodeField(rule, raw, path);
        },
        companionVerificationCandidate(edits: readonly NativeEdit[]) {
            if (problem || !document || text === undefined) {
                throw new NativeCodecError(
                    "read-only-document",
                    "Unsupported documents cannot produce edited verification candidates.",
                );
            }
            const patches: { start: number; end: number; token: string }[] = [];
            const seen = new Set<string>();
            for (const { path, value } of edits) {
                const key = JSON.stringify(path.map(String));
                if (seen.has(key))
                    throw new NativeCodecError("duplicate-edit", "Each field may be edited only once.", path);
                seen.add(key);
                const rule = fieldRule(kind, path);
                if (!rule)
                    throw new NativeCodecError(
                        "unowned-field",
                        "The field is not owned by this qualified scalar codec.",
                        path,
                    );
                const node = nodeAt(document, path);
                if (!isScalar(node) || !node.range || typeof node.value !== "string") {
                    throw new NativeCodecError(
                        "missing-field",
                        "Only existing scalar ranges can be edited; no fields are inserted.",
                        path,
                    );
                }
                const before = decodeField(rule, node.value, path);
                const after = encodeField(rule, value, path);
                if (JSON.stringify(before.value) !== JSON.stringify(after.decoded.value)) {
                    patches.push({ start: node.range[0], end: node.range[1], token: after.token });
                }
            }
            if (!patches.length) return new Uint8Array(original);
            patches.sort((a, b) => b.start - a.start);
            let result = text;
            let boundary = text.length;
            for (const patch of patches) {
                if (patch.end > boundary)
                    throw new NativeCodecError("overlapping-edits", "Scalar edit ranges overlap.");
                result = result.slice(0, patch.start) + patch.token + result.slice(patch.end);
                boundary = patch.start;
            }
            let output = new TextEncoder().encode(result);
            if (kind === "radio") output = replaceRadioChecksum(output);
            const checked = inspectNativeYaml(output, { profileId });
            if (checked.mode !== "verification-only") {
                throw new NativeCodecError("invalid-candidate", "The edited bytes failed native qualification checks.");
            }
            return output;
        },
    });
}
