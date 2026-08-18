import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyAffected } from "../affected.mjs";
import { buildPlan } from "../domains.mjs";
import { computeDomainFingerprint } from "../hash.mjs";
import { recordReceipt, reusableReceipt } from "../cache.mjs";
import { executePlan } from "../runner.mjs";
import { executeRelease, planRelease } from "../release.mjs";
import { readConfig } from "../utils.mjs";

const config = readConfig();

function classify(files, patches = {}) {
  return classifyAffected({ files, patches }, config);
}

function planFor(classified, level = "targeted") {
  return buildPlan({ config, ...classified, level });
}

function temporaryFingerprintFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-verification-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "input.txt"), "input-v1\n");
  fs.writeFileSync(path.join(root, "sample.test.mjs"), "test-v1\n");
  fs.writeFileSync(path.join(root, "runner.mjs"), "runner-v1\n");
  fs.writeFileSync(path.join(root, "package-lock.json"), "lock-v1\n");
  const fixtureConfig = {
    version: 1,
    cacheVersion: 1,
    globalHashInputs: ["package-lock.json"],
    runnerInputs: ["runner.mjs"],
    checks: { "sample:test": { command: ["node", "sample.test.mjs"] } },
    domains: {
      sample: {
        patterns: ["input.txt"],
        testInputs: ["sample.test.mjs"],
        upstream: [],
      },
    },
  };
  const files = ["input.txt", "sample.test.mjs", "runner.mjs", "package-lock.json"];
  const fingerprint = () => computeDomainFingerprint({ root, config: fixtureConfig, domainId: "sample", checks: ["sample:test"], files });
  return { root, fixtureConfig, fingerprint };
}

test("Economics CSS selects only economics visual verification", () => {
  const affected = classify(["src/components/Economics.css"]);
  assert.deepEqual(affected.directDomains, ["economics-ui"]);
  assert.deepEqual(affected.affectedDomains, ["economics-ui"]);
  assert.equal(affected.visualImpact["economics-ui"], "high");
  const plan = planFor(affected);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].visual, true);
  assert.equal(plan[0].visualImpact, "high");
  assert.doesNotMatch(plan[0].checks.join(" "), /financial|capex|governance|build/);
});

test("Financial Model source selects financial and downstream parity without screenshots", () => {
  const affected = classify(["docs-platform/working/financial-model.yaml"]);
  assert.deepEqual(affected.directDomains, ["financial"]);
  assert.deepEqual(new Set(affected.affectedDomains), new Set(["financial", "investor-summary", "economics-ui", "launch-budget"]));
  const plan = planFor(affected);
  assert.equal(plan.every(entry => entry.visual === false), true);
  assert.equal(plan.find(entry => entry.domain === "economics-ui").profile, "dependency");
  assert.deepEqual(plan.find(entry => entry.domain === "economics-ui").checks, ["economics:data"]);
});

test("governance timeline implementation selects governance only", () => {
  const affected = classify(["docs-platform/app/src/governance/timeline.ts"]);
  assert.deepEqual(affected.directDomains, ["governance"]);
  assert.deepEqual(affected.affectedDomains, ["governance"]);
  assert.equal(affected.visualImpact.governance, "none");
});

test("Revenue text-only TSX is low impact and never requests a screenshot", () => {
  const file = "src/components/RevenueModel.tsx";
  const affected = classify([file], { [file]: '-const label = "Old";\n+const label = "New";' });
  assert.deepEqual(affected.directDomains, ["revenue-ui"]);
  assert.equal(affected.visualImpact["revenue-ui"], "low");
  const plan = planFor(affected);
  assert.equal(plan[0].visual, true);
  assert.equal(plan[0].visualImpact, "low");
  assert.doesNotMatch(plan[0].checks.join(" "), /financial|capex|governance|google/);
});

test("package-lock change invalidates the dependency fingerprint", t => {
  const fixture = temporaryFingerprintFixture(t);
  const before = fixture.fingerprint();
  fs.writeFileSync(path.join(fixture.root, "package-lock.json"), "lock-v2\n");
  const after = fixture.fingerprint();
  assert.notEqual(after.dependencyHash, before.dependencyHash);
  assert.notEqual(after.inputHash, before.inputHash);
});

test("test-file change invalidates the test definition and domain hash", t => {
  const fixture = temporaryFingerprintFixture(t);
  const before = fixture.fingerprint();
  fs.writeFileSync(path.join(fixture.root, "sample.test.mjs"), "test-v2\n");
  const after = fixture.fingerprint();
  assert.notEqual(after.testDefinitionHash, before.testDefinitionHash);
  assert.notEqual(after.inputHash, before.inputHash);
});

test("Financial test-only change stays in financial and has no visual or downstream expansion", () => {
  const affected = classify(["docs-platform/app/test/financial-model.test.ts"]);
  assert.deepEqual(affected.directDomains, ["financial"]);
  assert.deepEqual(affected.affectedDomains, ["financial"]);
  const plan = planFor(affected);
  assert.equal(plan.every(entry => entry.visual === false), true);
  assert.equal(plan.some(entry => ["investor-summary", "economics-ui", "launch-budget"].includes(entry.domain)), false);
});

test("same PASS fingerprint is reused", t => {
  const fixture = temporaryFingerprintFixture(t);
  const fingerprint = fixture.fingerprint();
  const state = { version: 1, receipts: {} };
  recordReceipt(state, fingerprint, { result: "PASS", durationMs: 5 });
  assert.equal(reusableReceipt(state, fixture.fingerprint())?.result, "PASS");
});

test("failed cache receipt is never reused", t => {
  const fixture = temporaryFingerprintFixture(t);
  const fingerprint = fixture.fingerprint();
  const state = { version: 1, receipts: {} };
  recordReceipt(state, fingerprint, { result: "FAIL", durationMs: 5 });
  assert.equal(reusableReceipt(state, fingerprint), null);
});

test("runner version change invalidates every matching receipt", t => {
  const fixture = temporaryFingerprintFixture(t);
  const before = fixture.fingerprint();
  fs.writeFileSync(path.join(fixture.root, "runner.mjs"), "runner-v2\n");
  const after = fixture.fingerprint();
  assert.notEqual(after.runnerVersionHash, before.runnerVersionHash);
  assert.notEqual(after.inputHash, before.inputHash);
});

test("release reuses current domains, plans stale domain, and retains mandatory gates", async () => {
  const emptyState = { version: 1, receipts: {} };
  const initial = planRelease(config, emptyState);
  for (const item of initial.domains) {
    if (item.domain !== "economics-ui") recordReceipt(emptyState, item.fingerprint, { result: "PASS", durationMs: 1 });
  }
  const planned = planRelease(config, emptyState);
  assert.equal(planned.domains.find(item => item.domain === "financial").status, "REUSED");
  assert.equal(planned.domains.find(item => item.domain === "economics-ui").status, "RUN");
  assert.deepEqual(planned.gates.map(gate => gate.id), config.release.alwaysRun);
  const report = await executeRelease({ config, state: emptyState, dryRun: true });
  assert.equal(report.domainReport.run.length > 0, true);
  assert.equal(report.domainReport.run.every(item => item.domain === "economics-ui"), true);
  assert.equal(report.gates.filter(gate => gate.result === "PENDING").length, config.release.alwaysRun.length - 1);
  assert.equal(report.gates.at(-1).result, "NOT_APPLICABLE");
});

test("upstream failure prevents downstream expensive checks", async () => {
  const calls = [];
  const testConfig = structuredClone(config);
  testConfig.checks["mock:upstream"] = { command: ["false"] };
  testConfig.checks["mock:downstream"] = { command: ["false"] };
  const plan = [
    { domain: "financial", profile: "direct", level: "targeted", checks: ["mock:upstream"], visualImpact: "none", visual: false },
    { domain: "economics-ui", profile: "dependency", level: "integration", checks: ["mock:downstream"], visualImpact: "none", visual: false },
  ];
  const report = await executePlan({
    config: testConfig,
    plan,
    affected: { directDomains: ["financial"], affectedDomains: ["financial", "economics-ui"], visualImpact: {} },
    useCache: false,
    state: { version: 1, receipts: {} },
    saveStateFn: () => {},
    executeCheckFn: async id => {
      calls.push(id);
      return { id, result: "FAIL", durationMs: 1, logPath: ".cache/verification/logs/mock.log", detail: "synthetic failure" };
    },
  });
  assert.equal(report.result, "FAIL");
  assert.deepEqual(calls, ["mock:upstream"]);
  assert.equal(report.skipped.includes("economics-ui"), true);
});

test("unrelated domain never enters a selective plan", () => {
  const affected = classify(["src/components/Economics.css"]);
  const plan = planFor(affected);
  assert.equal(plan.some(entry => ["revenue-ui", "launch-budget", "capex", "governance", "google-publisher"].includes(entry.domain)), false);
});

test("single UI change cannot explode into full project checks", () => {
  const file = "src/components/RevenueModel.tsx";
  const affected = classify([file], { [file]: '-const title = "A";\n+const title = "B";' });
  const checkIds = planFor(affected).flatMap(entry => entry.checks);
  assert.equal(checkIds.includes("financial:unit"), false);
  assert.equal(checkIds.includes("capex:unit"), false);
  assert.equal(checkIds.includes("governance:unit"), false);
  assert.equal(checkIds.includes("google:unit"), false);
  assert.equal(checkIds.includes("build:production"), false);
});
