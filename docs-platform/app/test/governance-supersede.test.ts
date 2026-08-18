import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { SUPERSEDE_ALLOWED_FROM, buildSupersedeEvent, buildSupersedeInput, supersededByOf } from "../src/governance/supersede.js";
import {
  appendGovernanceEvent,
  buildGovernanceEvent,
  readTimelineEvents,
  validateTimeline,
  type GovernanceEventInputV2,
  type GovernanceEventV2,
} from "../src/governance/timeline.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRoot = path.resolve(platform, "..");

// Existing governed iterations are used as real, file-backed superseded/superseding references.
const SOURCE = "ITR-GOVERNANCE-PRECOMMIT-PUBLICATION-2026-08-16-01";
const TARGET = "ITR-GOVERNANCE-SUPERSEDE-SYNCED-2026-08-18-01";
const SEALED_ITERATION = "ITR-FINANCIAL-MODEL-2026-08-16-01";
const DEPLOYED_ITERATION = "ITR-REVENUE-MODEL-DAILY-LAYOUT-2026-08-15-01";

function fixtureInput(iterationId: string, eventType: GovernanceEventInputV2["event_type"], step: number): GovernanceEventInputV2 {
  const timestamp = new Date(Date.parse("2026-08-18T00:00:00.000Z") + step).toISOString();
  return {
    event_id: `EVT-${iterationId}-${eventType.toUpperCase()}-${step}`,
    event_type: eventType,
    occurred_at: timestamp,
    recorded_at: timestamp,
    iteration_id: iterationId,
    proposal_id: null,
    decision_id: null,
    change_set_id: null,
    actor: "node:test",
    tool: "governance supersede test",
    scope: "temporary lifecycle fixture",
    summary: `${eventType} lifecycle fixture`,
    approved_payload_sha256: null,
    before_hash: null,
    after_hash: null,
    affected_document_ids: [],
    affected_section_ids: [],
    source_refs: [],
    git: { content_commit_hash: null, seal_commit_ref: null, iteration_tag: null, commit_message_verified: null, trailers_verified: null },
    external: { google_sync_receipts: [], deployment_receipt: null, remote_readback_hash: null, production_url: null },
    rollback: { rollback_payload: null, compensates_iteration_id: null, restores_hash: null, dependency_check: null },
    artifacts: { manifest_refs: [] },
    confidence: "exact",
  };
}

function lifecycle(iterationId: string, types: GovernanceEventInputV2["event_type"][], seed: GovernanceEventV2[] = []): GovernanceEventV2[] {
  const events = [...seed];
  for (const [index, type] of types.entries()) events.push(buildGovernanceEvent(fixtureInput(iterationId, type, index + 1), events));
  return events;
}

const supersede = (events: GovernanceEventV2[], iterationId = SOURCE, supersededBy = TARGET, reason = "consolidated into a later governed iteration") =>
  buildSupersedeEvent({ iterationId, supersededByIterationId: supersededBy, reason, occurredAt: "2026-08-18T12:00:00.000Z" }, events);

test("supersede is allowed only from approved, previewed, verified and synced", () => {
  assert.deepEqual([...SUPERSEDE_ALLOWED_FROM], ["approved", "previewed", "verified", "synced"]);
});

test("PASS: verified -> superseded", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified"]);
  const event = supersede(events);
  assert.equal(event.event_type, "superseded");
  assert.equal(event.iteration_id, SOURCE);
  assert.equal(supersededByOf(event), TARGET);
  assert.ok(event.source_refs.includes(`docs-platform/changes/iterations/${TARGET}.yaml`));
  assert.deepEqual(validateTimeline([...events, event]), []);
});

test("PASS: synced -> superseded keeps external receipts, creates no rollback and needs no Google API", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified", "published", "synced"]);
  const syncedBefore = JSON.stringify(events[5]);
  const event = supersede(events);
  assert.equal(event.event_type, "superseded");
  assert.equal(JSON.stringify(events[5]), syncedBefore, "prior synced event bytes must not change");
  assert.deepEqual(event.external, { google_sync_receipts: [], deployment_receipt: null, remote_readback_hash: null, production_url: null });
  assert.equal(event.rollback.rollback_payload, null);
  assert.equal(event.rollback.compensates_iteration_id, null);
  assert.equal(event.rollback.restores_hash, null);
  assert.match(event.rollback.dependency_check ?? "", /No rollback/);
  assert.match(event.rollback.dependency_check ?? "", new RegExp(`superseded_by=${TARGET}`));
  assert.deepEqual(validateTimeline([...events, event]), []);
  assert.equal(event.previous_event_hash, events.at(-1)!.event_hash, "append-only hash chain continues from the synced event");
});

test("PASS: the ordinary verified -> committed and verified -> published -> synced -> committed paths still validate", () => {
  assert.deepEqual(validateTimeline(lifecycle("ITR-ORDINARY-STILL-WORKS", ["proposed", "approved", "applied", "verified", "committed"])), []);
  assert.deepEqual(validateTimeline(lifecycle("ITR-PREPUBLISHED-STILL-WORKS", ["proposed", "approved", "applied", "verified", "published", "synced", "committed"])), []);
});

test("FAIL: sealed (committed) -> superseded is rejected", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified", "committed"]);
  assert.throws(() => supersede(events), /committed -> superseded/);
});

test("FAIL: deployed -> superseded is rejected", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified", "committed", "deployed"]);
  assert.throws(() => supersede(events), /deployed -> superseded/);
});

test("FAIL: an iteration cannot supersede itself", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified"]);
  assert.throws(() => supersede(events, SOURCE, SOURCE), /cannot supersede itself/);
});

test("FAIL: missing superseding iteration metadata is rejected", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified"]);
  assert.throws(() => supersede(events, SOURCE, "ITR-DOES-NOT-EXIST-2099-01-01-01"), /Unknown iteration ITR-DOES-NOT-EXIST/);
});

test("FAIL: missing source iteration metadata and empty reason are rejected", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified"]);
  assert.throws(() => supersede(events, "ITR-ALSO-MISSING-2099-01-01-01"), /Unknown iteration ITR-ALSO-MISSING/);
  assert.throws(() => buildSupersedeInput({ iterationId: SOURCE, supersededByIterationId: TARGET, reason: "  " }, events), /reason is required/);
});

test("FAIL: superseding an already superseded iteration is rejected", () => {
  const events = lifecycle(SOURCE, ["proposed", "approved", "applied", "verified", "synced"]);
  const first = supersede(events);
  assert.throws(() => supersede([...events, first]), /already superseded/);
});

test("append-only: superseded event is written through appendGovernanceEvent and the file hash chain validates", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-supersede-"));
  const file = path.join(directory, "events.ndjson");
  for (const [index, type] of (["proposed", "approved", "applied", "verified", "published", "synced"] as const).entries()) {
    appendGovernanceEvent(fixtureInput(SOURCE, type, index + 1), file);
  }
  const before = fs.readFileSync(file, "utf8");
  const events = readTimelineEvents(file);
  const input = buildSupersedeInput({ iterationId: SOURCE, supersededByIterationId: TARGET, reason: "fixture", occurredAt: "2026-08-18T12:00:00.000Z" }, events);
  appendGovernanceEvent(input, file);
  const after = fs.readFileSync(file, "utf8");
  assert.equal(after.startsWith(before), true, "existing bytes are untouched");
  const all = readTimelineEvents(file) as GovernanceEventV2[];
  assert.equal(all.length, 7);
  assert.equal(all.at(-1)!.event_type, "superseded");
  assert.deepEqual(validateTimeline(all), []);
});

test("real repository: sealed and deployed iterations are not supersede candidates; Google receipts are untouched by the module", () => {
  const events = readTimelineEvents() as GovernanceEventV2[];
  const lastOf = (id: string) => [...events].reverse().find(event => event.iteration_id === id);
  assert.equal(lastOf(SEALED_ITERATION)?.event_type, "committed");
  assert.equal(lastOf(DEPLOYED_ITERATION)?.event_type, "deployed");
  assert.throws(() => supersede(events, SEALED_ITERATION), /committed -> superseded/);
  assert.throws(() => supersede(events, DEPLOYED_ITERATION), /deployed -> superseded/);
  const receipt = path.join(projectRoot, "docs-platform/changelog/google-sync/2026-08-16-DOC-INVESTOR-FINANCIAL-SUMMARY-02.yaml");
  if (fs.existsSync(receipt)) {
    const before = fs.readFileSync(receipt, "utf8");
    const parsed = YAML.parse(before);
    assert.equal(parsed.registry_id, "DOC-INVESTOR-FINANCIAL-SUMMARY");
    assert.equal(fs.readFileSync(receipt, "utf8"), before);
  }
  const moduleSource = fs.readFileSync(path.join(projectRoot, "docs-platform/app/src/governance/supersede.ts"), "utf8");
  assert.doesNotMatch(moduleSource, /googleapis|google\/(drive|sheets|auth|docs|publisher|workspace)\.js|OAuth/i, "supersede module must not import Google clients");
  assert.equal(moduleSource.includes('from "../google/config.js"'), true, "platformRoot path helper is the only google/ import");
});
