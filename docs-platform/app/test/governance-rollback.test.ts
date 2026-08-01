import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registryHash, reverseChangeFromReceipt, simulateChange, type ChangeSet, type Registry } from "../src/governance/registry.js";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = [path.join(app, "node_modules", "tsx", "dist", "cli.mjs"), "src/cli.ts"];
const emptyRegistry = (): Registry => ({ facts: [], assumptions: [], decisions: [], metrics: [], documents: [], principles: [], dependencies: [], sources: [{ id: "A" }, { id: "B" }, { id: "C" }] });

test("rollback is a new reverse change set and restores the exact original registry hash", () => {
  const before = emptyRegistry();
  const forward: ChangeSet = { change_id: "CHG-TEST", title: "remove middle", status: "approved", created_at: "2026-08-01", decision_id: "DEC-TEST", operations: [{ type: "remove", entity: "sources", id: "B" }] };
  const applied = simulateChange(before, forward);
  const receipt = { change_id: forward.change_id, iteration_id: "ITR-TEST", before_hash: registryHash(before), after_hash: registryHash(applied.registry), operations: applied.operations };
  const reverse = reverseChangeFromReceipt(receipt, "CHG-ROLLBACK-TEST", "DEC-ROLLBACK-TEST");
  assert.equal(reverse.change_id, "CHG-ROLLBACK-TEST");
  assert.equal(reverse.rollback_of, "CHG-TEST");
  assert.equal(reverse.status, "proposed");
  assert.deepEqual(reverse.operations, [{ type: "add", entity: "sources", value: { id: "B" }, position: 1 }]);
  const restored = simulateChange(applied.registry, reverse).registry;
  assert.equal(registryHash(restored), registryHash(before));
});

test("apply with an absent approved decision is forbidden before any registry write", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-change-"));
  const file = path.join(directory, "missing-decision.yaml");
  fs.writeFileSync(file, "change_id: CHG-MISSING-DECISION\ntitle: blocked\nstatus: approved\ncreated_at: 2026-08-01\ndecision_id: DEC-NOT-REGISTERED\noperations: []\n");
  assert.throws(() => execFileSync(process.execPath, [...cli, "change:apply", file], { cwd: app, stdio: "pipe" }), /Command failed/);
});
