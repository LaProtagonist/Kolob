import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { buildContentStateManifest } from "../src/capex/content-state.js";
import { DEPLOYMENT_MANIFEST_NAME, distSha256, writeDeploymentManifest } from "../src/governance/deployment.js";
import { classifyDeploymentDrift } from "../src/governance/external.js";
import { EVENT_TYPES } from "../src/governance/timeline.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");

test("dist hash is deterministic and excludes review output and its self-referential deployment manifest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-dist-hash-"));
  try {
    fs.writeFileSync(path.join(directory, "index.html"), "content");
    fs.mkdirSync(path.join(directory, "assets"));
    fs.writeFileSync(path.join(directory, "assets", "app.js"), "app");
    fs.mkdirSync(path.join(directory, "__review"));
    fs.writeFileSync(path.join(directory, "__review", "ignored.html"), "first");
    const first = distSha256(directory);
    fs.writeFileSync(path.join(directory, "__review", "ignored.html"), "second");
    fs.writeFileSync(path.join(directory, DEPLOYMENT_MANIFEST_NAME), "self metadata");
    assert.equal(distSha256(directory), first);
    fs.writeFileSync(path.join(directory, "assets", "app.js"), "changed");
    assert.notEqual(distSha256(directory), first);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("production manifest records content, content commit, seal commit, build head and dist separately", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-deployment-manifest-"));
  try {
    fs.writeFileSync(path.join(directory, "index.html"), "content");
    const manifest = writeDeploymentManifest({
      iterationId: "ITR-TEST",
      contentCommitHash: "a".repeat(40),
      sealCommitHash: "b".repeat(40),
      deploymentId: "DEPLOY-TEST",
      productionUrl: "https://example.invalid",
      builtAt: "2026-08-10T00:00:00.000Z",
      deployedAt: "2026-08-10T00:00:01.000Z",
      distDirectory: directory,
    });
    assert.equal(manifest.content_state_sha256, buildContentStateManifest(project).content_state_sha256);
    assert.match(manifest.repository_head_at_build, /^[0-9a-f]{40}$/);
    assert.equal(manifest.dist_sha256, distSha256(directory));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, DEPLOYMENT_MANIFEST_NAME), "utf8")).seal_commit_hash, "b".repeat(40));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("deployment drift distinguishes content drift from governance-only HEAD movement", () => {
  const hash = "a".repeat(64);
  const dist = "b".repeat(64);
  const seal = "c".repeat(40);
  const remote = { content_state_sha256: hash, dist_sha256: dist };
  assert.equal(classifyDeploymentDrift({ receiptContentState: hash, receiptDistSha256: dist, receiptSealCommit: seal, currentContentState: hash, repositoryHead: seal, remote }).status, "match");
  assert.deepEqual(classifyDeploymentDrift({ receiptContentState: hash, receiptDistSha256: dist, receiptSealCommit: seal, currentContentState: "d".repeat(64), repositoryHead: seal, remote }).drift_kind, "content");
  const governanceOnly = classifyDeploymentDrift({ receiptContentState: hash, receiptDistSha256: dist, receiptSealCommit: seal, currentContentState: hash, repositoryHead: "e".repeat(40), remote });
  assert.equal(governanceOnly.status, "governance_only_drift");
  assert.equal(governanceOnly.action.includes("No deployment required"), true);
  assert.equal(classifyDeploymentDrift({ receiptContentState: hash, receiptDistSha256: dist, receiptSealCommit: seal, currentContentState: hash, repositoryHead: seal, remote: { ...remote, dist_sha256: "f".repeat(64) } }).drift_kind, "content");
});

test("deployment receipt schema and lifecycle require the expanded provenance fields", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(platform, "schemas", "deployment-receipt.schema.json"), "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate({
    schema_version: 2,
    iteration_id: "ITR",
    content_state_sha256: "a".repeat(64),
    content_commit_hash: "b".repeat(40),
    seal_commit_hash: "c".repeat(40),
    repository_head_at_build: "c".repeat(40),
    dist_sha256: "d".repeat(64),
    deployment_id: "DEPLOY",
    production_url: "https://example.invalid",
    built_at: "2026-08-10T00:00:00.000Z",
    deployed_at: "2026-08-10T00:00:01.000Z",
    smoke_test_result: "passed",
  }), true);
  assert.equal(EVENT_TYPES.includes("deployed"), true);
});
