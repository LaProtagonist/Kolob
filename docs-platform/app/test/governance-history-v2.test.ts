import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { validateArtifacts, readArtifactManifests } from "../src/governance/artifacts.js";
import {
  buildProjectState,
  canonicalDocumentHashes,
  contextValidationErrors,
  onboardReport,
  projectionFreshnessErrors,
  readProjectState,
  registryProjectionHash,
  renderHandoff,
} from "../src/governance/context.js";
import { deploymentDriftCheck, googleDriftCheck } from "../src/governance/external.js";
import { createHistoricalIterationTags, readGitLinkIndex, verifyHistoricalTags } from "../src/governance/history.js";
import {
  findContentCommit,
  lifecycleErrors,
  loadGovernedIteration,
  parsePorcelainPaths,
  REQUIRED_TRAILERS,
  verifyRequiredTrailers,
  type GovernedIteration,
} from "../src/governance/git-workflow.js";
import { readImmutabilityBaseline, validateImmutability } from "../src/governance/immutability.js";
import { historicalCompensationPreview, rollbackLatestPreview } from "../src/governance/reversal.js";
import {
  appendGovernanceEvent,
  effectiveType,
  isV2,
  readTimelineEvents,
  renderTimeline,
  validateTimeline,
  type GovernanceEventInputV2,
  type GovernanceEventV2,
} from "../src/governance/timeline.js";
import { canonical, gitText, sha256 } from "../src/governance/util.js";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = path.resolve(app, "..");
const root = path.resolve(platform, "..");
const eventsFile = path.join(platform, "changelog", "events.ndjson");

function eventInput(type: GovernanceEventInputV2["event_type"], id: string, timestamp: string): GovernanceEventInputV2 {
  return {
    event_id: id,
    event_type: type,
    occurred_at: timestamp,
    recorded_at: timestamp,
    iteration_id: "ITR-V2-TEST",
    proposal_id: "PROP-V2-TEST",
    decision_id: null,
    change_set_id: null,
    actor: "node:test",
    tool: "governance test",
    scope: "temporary test scope",
    summary: `${type} test`,
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
  };
}

test("1. protected old events.ndjson prefixes remain byte-identical", () => {
  const baseline = readImmutabilityBaseline();
  const bytes = fs.readFileSync(eventsFile);
  for (const item of baseline.events_prefixes) assert.equal(sha256(bytes.subarray(0, item.bytes)), item.sha256);
});

test("2. append-only writer preserves all prior bytes", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "governance-v2-")), "events.ndjson");
  appendGovernanceEvent(eventInput("proposed", "EVT-V2-TEST-001", "2026-08-05T10:00:00.000Z"), file);
  const prefix = fs.readFileSync(file);
  appendGovernanceEvent(eventInput("approved", "EVT-V2-TEST-002", "2026-08-05T10:00:00.001Z"), file);
  assert.deepEqual(fs.readFileSync(file).subarray(0, prefix.length), prefix);
});

test("3. event hash chain is valid", () => assert.deepEqual(validateTimeline(), []));

test("4. Governance v2 sequence is monotonic", () => {
  const events = readTimelineEvents().filter(isV2);
  for (let index = 1; index < events.length; index += 1) assert.ok(events[index].sequence > events[index - 1].sequence);
});

test("5. event IDs are unique", () => {
  const ids = readTimelineEvents().map(event => event.event_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("6. every new event uses a supported schema version", () => {
  for (const event of readTimelineEvents().slice(32)) assert.equal(isV2(event) && event.schema_version, 2);
});

test("7. all seven originally reported modern iterations have committed events", () => {
  const events = readTimelineEvents();
  for (const link of readGitLinkIndex().iterations.slice(0, 7)) assert.ok(events.some(event => event.iteration_id === link.iteration_id && effectiveType(event) === "committed"));
});

test("8. every exact historical iteration has an annotated tag", () => assert.deepEqual(verifyHistoricalTags(), []));

test("9. each exact tag points to the audited content commit", () => {
  for (const link of readGitLinkIndex().iterations.filter(item => item.confidence === "exact")) assert.equal(gitText(["rev-parse", `${link.tag}^{commit}`]), link.probable_git_commit);
});

test("10. trailer checker rejects legacy commits and accepts only exact iteration metadata", () => {
  const link = readGitLinkIndex().iterations[0];
  const iteration = YAML.parse(fs.readFileSync(path.join(platform, "changes", "iterations", `${link.iteration_id}.yaml`), "utf8"));
  const governed = { ...iteration, schema_version: 2, before_state_sha256: link.before_hash ?? "0".repeat(64), after_state_sha256: link.after_hash } as GovernedIteration;
  assert.ok(verifyRequiredTrailers(link.probable_git_commit, governed, "0".repeat(64)).length >= REQUIRED_TRAILERS.length);
});

test("10a. seal content lookup resolves exact ancestor commits instead of assuming HEAD", () => {
  const expectations = new Map([
    ["ITR-REVENUE-MODEL-DAILY-LAYOUT-2026-08-15-01", "f67920077a9ba7b07cc20ecc7be34b72dee4b4a5"],
    ["ITR-FINANCIAL-MODEL-2026-08-16-01", "c86133747af6e469a15bad1780cc63fca5482fe5"],
  ]);
  for (const [iterationId, expected] of expectations) {
    const iteration = loadGovernedIteration(iterationId);
    const verified = [...readTimelineEvents()].reverse().find(event => event.iteration_id === iterationId && effectiveType(event) === "verified")!;
    assert.equal(findContentCommit(iteration, verified), expected);
  }
  assert.notEqual(expectations.get("ITR-REVENUE-MODEL-DAILY-LAYOUT-2026-08-15-01"), gitText(["rev-parse", "HEAD"]));
});

test("11. Handoff is an exact generated projection with a do-not-edit marker", () => {
  const state = readProjectState();
  const handoff = fs.readFileSync(path.join(platform, "context", "CODEX_HANDOFF.md"), "utf8");
  assert.ok(handoff.startsWith("AUTO-GENERATED — DO NOT EDIT MANUALLY"));
  assert.equal(handoff, renderHandoff(state));
});

test("12. Handoff timeline head is current", () => {
  const state = readProjectState();
  const head = readTimelineEvents().at(-1)!;
  assert.equal(state.latest_timeline_event_id, head.event_id);
  assert.equal(state.latest_timeline_event_hash, head.event_hash);
});

test("13. PROJECT_STATE registry hash is current", () => assert.equal(readProjectState().registry_hash, registryProjectionHash()));

test("14. onboarding freshness logic detects a stale Handoff", () => {
  const state = readProjectState();
  assert.match(projectionFreshnessErrors(state, `${renderHandoff(state)}\nmanual edit`, renderTimeline(), state).join("\n"), /HANDOFF.*stale/i);
});

test("15. project:onboard reports the dirty worktree without hiding it", () => assert.match(onboardReport().output, /dirty: yes/));

test("16. legacy imports distinguish occurred_at from recorded_at", () => {
  const imports = readTimelineEvents().filter((event): event is GovernanceEventV2 => isV2(event) && event.event_type === "legacy_imported");
  assert.equal(imports.length, 12);
  for (const event of imports) assert.ok(event.occurred_at && event.recorded_at && event.occurred_at <= event.recorded_at);
});

test("17. partial legacy evidence never claims a complete lifecycle", () => {
  const partial = readTimelineEvents().filter((event): event is GovernanceEventV2 => isV2(event) && event.event_type === "legacy_imported" && event.confidence === "partial");
  assert.equal(partial.length, 1);
  assert.ok(partial[0].missing_lifecycle_stages && partial[0].missing_lifecycle_stages.length > 0);
  assert.equal(partial[0].approved_payload_sha256, null);
});

test("18. sequential latest rollback remains available", () => {
  const preview = rollbackLatestPreview(2);
  assert.equal(preview.mode, "rollback_latest");
  assert.equal(preview.suffix_only, true);
  assert.equal(preview.order.length, 2);
});

test("19. rollback cannot extract a middle iteration", () => {
  assert.throws(() => rollbackLatestPreview(0), /positive integer/);
  const latestCommitted = [...readTimelineEvents()].reverse().find(event => effectiveType(event) === "committed")!;
  assert.deepEqual(rollbackLatestPreview(1).order.map(item => item.iteration_id), [latestCommitted.iteration_id]);
});

test("20. historical compensation produces a new proposed change set", () => {
  const preview = historicalCompensationPreview("ITR-INVESTOR-START-MODEL-2026-08-04-01");
  assert.equal(preview.mode, "historical_compensation");
  assert.equal(preview.proposal.status, "proposed");
  assert.equal(preview.applies_changes, false);
});

test("21. compensation discovers dependent later changes", () => {
  const preview = historicalCompensationPreview("ITR-INVESTOR-START-MODEL-2026-08-04-01");
  assert.ok(preview.later_dependencies.length >= 1);
  assert.ok(preview.conflicts.length >= 1);
});

test("22. external drift check never overwrites or appends without confirmed remote hashes", () => {
  const before = fs.readFileSync(eventsFile);
  const results = googleDriftCheck({}, false);
  assert.ok(results.every(result => result.status !== "drift"));
  assert.deepEqual(fs.readFileSync(eventsFile), before);
});

test("23. Governance v2 Google receipt schema requires local and remote hashes", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(platform, "schemas", "google-sync-receipt.schema.json"), "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate({ receipt_version: 2, iteration_id: "ITR", content_commit_hash: "a".repeat(40), local_source_sha256: "b".repeat(64), google_file_id: "id", google_mime_type: "application/vnd.google-apps.document", remote_readback_sha256: "c".repeat(64), synced_at: "2026-08-05T00:00:00.000Z", result: "passed" }), true);
  assert.equal(validate({ receipt_version: 2 }), false);
});

test("24. deployment receipt schema requires separated content, seal and dist provenance", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(platform, "schemas", "deployment-receipt.schema.json"), "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate({ schema_version: 2, iteration_id: "ITR", content_state_sha256: "a".repeat(64), content_commit_hash: "b".repeat(40), seal_commit_hash: "c".repeat(40), repository_head_at_build: "c".repeat(40), dist_sha256: "d".repeat(64), deployment_id: "dep", production_url: "https://example.invalid", built_at: "2026-08-10T00:00:00.000Z", deployed_at: "2026-08-10T00:00:01.000Z", smoke_test_result: "passed" }), true);
  assert.equal(validate({ schema_version: 2, iteration_id: "ITR" }), false);
});

test("25. artifact manifests validate SHA-256 and size", () => assert.deepEqual(validateArtifacts(), []));

test("26. verified artifacts without durable storage are pending", () => {
  const artifacts = readArtifactManifests().flatMap(item => item.manifest.artifacts);
  assert.ok(artifacts.length >= 2);
  for (const artifact of artifacts.filter(item => !item.remote_url)) assert.equal(artifact.status, "pending_archive");
});

test("27. events, receipts, state and Handoff contain no secret material", () => {
  const files = [
    eventsFile,
    path.join(platform, "context", "PROJECT_STATE.yaml"),
    path.join(platform, "context", "CODEX_HANDOFF.md"),
    ...readImmutabilityBaseline().immutable_receipts.map(item => path.join(root, item.path)),
  ];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /refresh_token|client_secret|access_token|private_key/i, file);
});

test("28. old receipts remain byte-identical", () => assert.deepEqual(validateImmutability(), []));

test("29. context projection is deterministic", () => assert.equal(canonical(buildProjectState()), canonical(buildProjectState())));

test("30. TIMELINE rendering is deterministic", () => assert.equal(renderTimeline(), renderTimeline()));

test("31. mandatory trailers are enforced for future finalize", () => assert.deepEqual(REQUIRED_TRAILERS, ["Iteration-ID", "Decision-ID", "Change-Set-ID", "Approved-Payload-SHA256", "Before-State-SHA256", "After-State-SHA256", "Timeline-Head-SHA256"]));

test("31a. porcelain parser preserves the first unstaged path and rename target", () => {
  assert.deepEqual(parsePorcelainPaths(" M docs-platform/app/package.json\n?? output/review/file.jpg\n"), ["docs-platform/app/package.json", "output/review/file.jpg"]);
  assert.deepEqual(parsePorcelainPaths("R  old-name -> new-name\n"), ["new-name"]);
});

test("32. seal validation fails without a verified event", () => {
  const fake = {
    schema_version: 2, iteration_id: "ITR-MISSING-VERIFIED", proposal_id: "PROP", decision_id: "DEC", change_set_id: "CHG", title: "missing", status: "approved", approved_by: "owner", approved_at: "2026-08-05", actor: "Codex", scope: "test",
    approved_payload_path: "docs-platform/changelog/immutability-baseline.yaml", approved_payload_sha256: "0".repeat(64), before_state_sha256: "0".repeat(64), after_state_sha256: "0".repeat(64), affected_document_ids: [], affected_section_ids: [], state_hash_paths: [], content_paths: [], seal_paths: [], allowed_dirty_paths: [], rollback_payload: null,
  } satisfies GovernedIteration;
  assert.match(lifecycleErrors(fake).join("\n"), /verified event is missing/);
});

test("33. seal workflow contains an explicit duplicate-seal guard", () => {
  const source = fs.readFileSync(path.join(app, "src", "governance", "git-workflow.ts"), "utf8");
  assert.match(source, /is already sealed/);
});

test("34. tag creation is idempotent and never force-overwrites", () => {
  assert.deepEqual(createHistoricalIterationTags(), []);
  const source = fs.readFileSync(path.join(app, "src", "governance", "git-workflow.ts"), "utf8");
  assert.doesNotMatch(source, /\["tag",\s*"--force"/);
  assert.match(source, /refusing force overwrite/);
});

test("repository governance projections validate together", () => assert.deepEqual(contextValidationErrors(), []));
test("canonical document hash projection is stable and path-relative", () => assert.ok(canonicalDocumentHashes().every(item => !path.isAbsolute(item.local_path))));
