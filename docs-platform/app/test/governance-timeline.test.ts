import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { appendTimelineEvent, readTimelineEvents, validateTimeline, type TimelineEventInput } from "../src/governance/timeline.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const payloadPath = "docs-platform/changelog/payloads/ITR-CAPEX-REGISTER-2026-08-01-01-approved.yaml";
const rollbackPath = "docs-platform/changelog/iteration-receipts/ITR-CAPEX-REGISTER-2026-08-01-01.yaml";
const payloadHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(platform, "changelog", "payloads", "ITR-CAPEX-REGISTER-2026-08-01-01-approved.yaml"))).digest("hex");

function input(status: TimelineEventInput["lifecycle_status"], timestamp: string, suffix: number): TimelineEventInput {
  return {
    event_id: `EVT-TEST-${suffix}`, iteration_id: "ITR-TEST", proposal_id: "PROP-TEST", decision_id: "DEC-007",
    change_set_id: "CHG-011", timestamp, actor: "Codex test", tool: "node:test", lifecycle_status: status,
    action: status, scope: "timeline test", affected_document_ids: ["DOC-CAPEX-EQUIPMENT-SPECIFICATION"],
    affected_section_or_item_ids: ["CAPEX-01-001"], approved_payload: { path: payloadPath, sha256: payloadHash },
    before_hash: null, after_hash: payloadHash, google_file_id: null, google_sync_receipt: null,
    verification_receipt: null,
    validation_result: status === "verified" ? "passed" : "pending", git_commit_hash: null,
    rollback_reference: rollbackPath, summary: `Test ${status}`,
  };
}

test("timeline appends without changing prior bytes and validates its hash chain", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-timeline-"));
  const file = path.join(directory, "events.ndjson");
  appendTimelineEvent(input("proposed", "2026-08-01T10:00:00.000Z", 1), file);
  const firstBytes = fs.readFileSync(file, "utf8");
  appendTimelineEvent(input("approved", "2026-08-01T10:01:00.000Z", 2), file);
  assert.equal(fs.readFileSync(file, "utf8").startsWith(firstBytes), true);
  assert.deepEqual(validateTimeline(readTimelineEvents(file)), []);
});

test("timeline rejects duplicate IDs, chronological regressions and invalid lifecycle transitions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-timeline-"));
  const file = path.join(directory, "events.ndjson");
  appendTimelineEvent(input("proposed", "2026-08-01T10:00:00.000Z", 1), file);
  assert.throws(() => appendTimelineEvent(input("proposed", "2026-08-01T10:00:01.000Z", 1), file), /already exists/);
  assert.throws(() => appendTimelineEvent(input("approved", "2026-08-01T09:59:59.000Z", 2), file), /chronological order/);
  assert.throws(() => appendTimelineEvent(input("verified", "2026-08-01T10:01:00.000Z", 3), file), /Invalid lifecycle transition/);
});

test("editing a past event is detected and secret-shaped fields are rejected", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-timeline-"));
  const file = path.join(directory, "events.ndjson");
  appendTimelineEvent(input("proposed", "2026-08-01T10:00:00.000Z", 1), file);
  appendTimelineEvent(input("approved", "2026-08-01T10:01:00.000Z", 2), file);
  const events = readTimelineEvents(file);
  events[0].summary = "tampered";
  assert.equal(validateTimeline(events).some(error => /event_hash mismatch/.test(error)), true);
  assert.throws(() => appendTimelineEvent({ ...input("applied", "2026-08-01T10:02:00.000Z", 3), access_token: "forbidden" } as TimelineEventInput, file), /additional properties|forbidden/i);
});

test("repository timeline, when present, has valid references and no secret keys", () => {
  const file = path.join(platform, "changelog", "events.ndjson");
  if (!fs.existsSync(file)) return;
  const events = readTimelineEvents(file);
  assert.deepEqual(validateTimeline(events), []);
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /refresh_token|client_secret|access_token/i);
});
