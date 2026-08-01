import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = path.resolve(app, "..");
const registry = path.join(platform, "registry");
const cli = ["--import", "tsx", "src/cli.ts"];
function run(...args: string[]) { return execFileSync(process.execPath, [...cli, ...args], { cwd: app, encoding: "utf8", stdio: "pipe" }); }
function mutate(file: string, edit: (value: string) => string) { const target = path.join(registry, file); const before = fs.readFileSync(target, "utf8"); try { fs.writeFileSync(target, edit(before)); } finally { return () => fs.writeFileSync(target, before); } }

test("valid registry", () => assert.match(run("registry:validate"), /OK/));
test("empty metrics registry and sources without lifecycle status are valid", () => assert.match(run("registry:validate"), /OK/));
test("malformed YAML fails without accepting patch markers", () => { const restore = mutate("facts.yaml", x => x + "\n*** accidental patch marker\n"); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
test("duplicate ID fails", () => { const restore = mutate("facts.yaml", x => x + x.match(/  - id:[\s\S]*?(?=\n  - id:|$)/)![0]); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
test("missing source fails", () => { const restore = mutate("facts.yaml", x => x.replace("SRC-APPROVED-COPY", "SRC-MISSING")); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
test("approved fact without source fails", () => { const restore = mutate("facts.yaml", x => x.replace("source_ids: [SRC-APPROVED-COPY, SRC-RULES]", "source_ids: []")); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
test("metric without basis fails", () => { const restore = mutate("metrics.yaml", x => x.replace("metrics: []", "metrics:\n  - id: METRIC-TEST\n    title: Test\n    value: 1\n    unit: RUB\n    source_ids: []\n    assumption_ids: []\n    status: research\n    updated_at: 2026-07-21")); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
test("preview does not write", () => { const target = path.join(registry, "assumptions.yaml"), before = fs.readFileSync(target, "utf8"); const output = run("change:preview", "../changes/example-change.yaml"); assert.match(output, /validation: OK/); assert.equal(fs.readFileSync(target, "utf8"), before); });
test("apply rejects proposed change", () => assert.throws(() => run("change:apply", "../changes/example-change.yaml")));
test("invalid apply rolls back", () => { const change = path.join(platform, "changes", "invalid-apply.yaml"); fs.writeFileSync(change, "change_id: CHG-INVALID\ntitle: invalid\nstatus: approved\ncreated_at: 2026-07-21\ndecision_id: DEC-002\noperations:\n  - type: update\n    entity: facts\n    id: FACT-001\n    value:\n      source_ids: [SRC-NOT-FOUND]\n"); const target = path.join(registry, "facts.yaml"), before = fs.readFileSync(target, "utf8"); try { assert.throws(() => run("change:apply", "../changes/invalid-apply.yaml")); assert.equal(fs.readFileSync(target, "utf8"), before); } finally { fs.unlinkSync(change); } });
test("missing document dependency reference fails", () => { const restore = mutate("dependencies.yaml", x => x.replace("DOC-FOUNDATION", "DOC-MISSING")); try { assert.throws(() => run("registry:validate")); } finally { restore(); } });
