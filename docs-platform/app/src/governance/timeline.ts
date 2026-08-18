import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { atomicWrite, canonical, fileSha256, gitText, projectRoot, resolveProjectPath, secretShaped, sha256 } from "./util.js";

export const EVENTS_PATH = path.join(platformRoot, "changelog", "events.ndjson");
export const TIMELINE_PATH = path.join(platformRoot, "changelog", "TIMELINE.md");

export const ITERATION_STATUSES = ["proposed", "approved", "applied", "verified", "rejected", "superseded", "failed", "rolled_back"] as const;
export type IterationStatus = typeof ITERATION_STATUSES[number];

export const EVENT_TYPES = [
  "proposed", "approved", "previewed", "applied", "verified", "committed", "deployed", "published", "synced", "closed",
  "rejected", "failed", "superseded", "rollback_requested", "rollback_approved", "rolled_back",
  "compensation_proposed", "compensated", "external_drift_detected", "legacy_imported",
] as const;
export type GovernanceEventType = typeof EVENT_TYPES[number];

export type LegacyTimelineEvent = {
  event_id: string;
  previous_event_hash: string | null;
  event_hash: string;
  iteration_id: string;
  proposal_id: string;
  decision_id: string;
  change_set_id: string;
  timestamp: string;
  actor: string;
  tool: string;
  lifecycle_status: IterationStatus;
  action: string;
  scope: string;
  affected_document_ids: string[];
  affected_section_or_item_ids: string[];
  approved_payload: { path: string; sha256: string };
  before_hash: string | null;
  after_hash: string | null;
  google_file_id: string | null;
  google_sync_receipt: string | null;
  verification_receipt: string | null;
  validation_result: "pending" | "passed" | "failed";
  git_commit_hash: string | null;
  rollback_reference: string;
  summary: string;
};

export type GovernanceEventV2 = {
  schema_version: 2;
  sequence: number;
  event_id: string;
  event_type: GovernanceEventType;
  occurred_at: string;
  recorded_at: string;
  iteration_id: string;
  proposal_id: string | null;
  decision_id: string | null;
  change_set_id: string | null;
  actor: string;
  tool: string;
  scope: string;
  summary: string;
  approved_payload_sha256: string | null;
  before_hash: string | null;
  after_hash: string | null;
  affected_document_ids: string[];
  affected_section_ids: string[];
  source_refs: string[];
  previous_event_hash: string | null;
  event_hash: string;
  git: {
    content_commit_hash: string | null;
    seal_commit_ref: string | null;
    iteration_tag: string | null;
    commit_message_verified: boolean | null;
    trailers_verified: boolean | null;
  };
  external: {
    google_sync_receipts: string[];
    deployment_receipt: string | null;
    remote_readback_hash: string | null;
    production_url: string | null;
  };
  rollback: {
    rollback_payload: string | null;
    compensates_iteration_id: string | null;
    restores_hash: string | null;
    dependency_check: string | null;
  };
  artifacts: { manifest_refs: string[] };
  confidence?: "exact" | "high" | "partial";
  missing_lifecycle_stages?: string[];
};

export type TimelineEvent = LegacyTimelineEvent | GovernanceEventV2;
export type TimelineEventInput = Omit<LegacyTimelineEvent, "previous_event_hash" | "event_hash">;
export type GovernanceEventInputV2 = Omit<GovernanceEventV2, "schema_version" | "sequence" | "previous_event_hash" | "event_hash">;

const legacyTransitions: Record<IterationStatus, IterationStatus[]> = {
  proposed: ["approved", "rejected", "failed"],
  approved: ["applied", "rejected", "superseded", "failed"],
  applied: ["verified", "rolled_back", "failed"],
  verified: ["rolled_back", "superseded"],
  rejected: [], superseded: [], failed: [], rolled_back: [],
};

const modernTransitions: Record<GovernanceEventType, GovernanceEventType[]> = {
  proposed: ["approved", "rejected", "failed"],
  approved: ["previewed", "applied", "rejected", "superseded", "failed"],
  previewed: ["applied", "failed", "superseded"],
  applied: ["verified", "rollback_requested", "failed"],
  verified: ["committed", "published", "synced", "rollback_requested", "superseded", "failed", "external_drift_detected"],
  committed: ["deployed", "published", "synced", "closed", "rollback_requested", "external_drift_detected", "compensation_proposed"],
  deployed: ["deployed", "closed", "rollback_requested", "external_drift_detected", "compensation_proposed"],
  published: ["synced", "closed", "rollback_requested", "external_drift_detected"],
  synced: ["committed", "published", "closed", "rollback_requested", "external_drift_detected", "superseded"],
  closed: ["rollback_requested", "compensation_proposed", "external_drift_detected"],
  rejected: [], failed: [], superseded: [],
  rollback_requested: ["rollback_approved", "failed"],
  rollback_approved: ["rolled_back", "failed"],
  rolled_back: ["closed"],
  compensation_proposed: ["approved", "rejected", "failed", "compensated"],
  compensated: ["verified", "committed", "closed"],
  external_drift_detected: ["compensation_proposed", "rollback_requested", "closed", "external_drift_detected"],
  legacy_imported: [],
};

export function isV2(event: TimelineEvent): event is GovernanceEventV2 {
  return (event as GovernanceEventV2).schema_version === 2;
}

export function effectiveType(event: TimelineEvent): GovernanceEventType {
  return isV2(event) ? event.event_type : event.lifecycle_status;
}

export function effectiveOccurredAt(event: TimelineEvent): string {
  return isV2(event) ? event.occurred_at : event.timestamp;
}

export function effectiveRecordedAt(event: TimelineEvent): string {
  return isV2(event) ? event.recorded_at : event.timestamp;
}

export function effectiveDecisionId(event: TimelineEvent): string | null {
  return event.decision_id || null;
}

export function effectiveChangeSetId(event: TimelineEvent): string | null {
  return event.change_set_id || null;
}

export function effectiveCommit(event: TimelineEvent): string | null {
  return isV2(event) ? event.git.content_commit_hash : event.git_commit_hash;
}

export function effectiveTag(event: TimelineEvent): string | null {
  return isV2(event) ? event.git.iteration_tag : null;
}

export function effectiveGoogleReceipts(event: TimelineEvent): string[] {
  if (isV2(event)) return event.external.google_sync_receipts;
  return event.google_sync_receipt ? [event.google_sync_receipt] : [];
}

export function effectiveRollbackPayload(event: TimelineEvent): string | null {
  return isV2(event) ? event.rollback.rollback_payload : event.rollback_reference;
}

export function eventHash(event: Omit<TimelineEvent, "event_hash"> | Record<string, unknown>): string {
  return sha256(canonical(event));
}

export function readTimelineEvents(file = EVENTS_PATH): TimelineEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as TimelineEvent; }
    catch (error) { throw new Error(`Invalid timeline JSON on line ${index + 1}: ${(error as Error).message}`); }
  });
}

function existingChangeIds(): Set<string> {
  const changesDir = path.join(platformRoot, "changes");
  if (!fs.existsSync(changesDir)) return new Set();
  return new Set(fs.readdirSync(changesDir, { recursive: true, encoding: "utf8" })
    .filter(item => item.endsWith(".yaml"))
    .map(item => {
      try { return YAML.parse(fs.readFileSync(path.join(changesDir, item), "utf8"))?.change_id as string | undefined; }
      catch { return undefined; }
    }).filter(Boolean) as string[]);
}

function existingDecisionIds(): Set<string> {
  const ids = new Set<string>();
  const registry = YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"));
  for (const item of registry?.decisions ?? []) if (item.id) ids.add(item.id);
  const directory = path.join(platformRoot, "changes", "decisions");
  if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory).filter(item => item.endsWith(".yaml"))) {
    try { const item = YAML.parse(fs.readFileSync(path.join(directory, name), "utf8")); if (item?.decision_id) ids.add(item.decision_id); }
    catch { /* surfaced by the dedicated governance validator */ }
  }
  return ids;
}

function eventSchemaErrors(event: TimelineEvent): string[] {
  const schema = JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", "timeline-event.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(event) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

function validIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function verifyReference(reference: string): boolean {
  if (/^(?:git|commit|tag):/.test(reference)) return true;
  const clean = reference.split("#", 1)[0];
  return fs.existsSync(resolveProjectPath(clean));
}

function assertLegacyTransition(events: TimelineEvent[], input: TimelineEventInput): void {
  const prior = [...events].reverse().find(event => event.iteration_id === input.iteration_id);
  if (!prior) {
    if (input.lifecycle_status !== "proposed") throw new Error(`First event for ${input.iteration_id} must be proposed.`);
    return;
  }
  const type = effectiveType(prior) as IterationStatus;
  if (!legacyTransitions[type]?.includes(input.lifecycle_status)) {
    throw new Error(`Invalid lifecycle transition for ${input.iteration_id}: ${type} -> ${input.lifecycle_status}.`);
  }
}

export function buildGovernanceEvent(input: GovernanceEventInputV2, events = readTimelineEvents()): GovernanceEventV2 {
  if (events.some(event => event.event_id === input.event_id)) throw new Error(`Timeline event ${input.event_id} already exists.`);
  const prior = [...events].reverse().find(event => event.iteration_id === input.iteration_id);
  if (!prior) {
    if (!["proposed", "compensation_proposed", "external_drift_detected", "legacy_imported"].includes(input.event_type)) {
      throw new Error(`First v2 event for ${input.iteration_id} cannot be ${input.event_type}.`);
    }
  } else {
    const priorType = effectiveType(prior);
    if (!modernTransitions[priorType]?.includes(input.event_type)) {
      throw new Error(`Invalid v2 transition for ${input.iteration_id}: ${priorType} -> ${input.event_type}.`);
    }
  }
  const withoutHash = {
    schema_version: 2 as const,
    sequence: events.length + 1,
    ...input,
    previous_event_hash: events.at(-1)?.event_hash ?? null,
  };
  const event: GovernanceEventV2 = { ...withoutHash, event_hash: eventHash(withoutHash) };
  const errors = eventSchemaErrors(event);
  if (errors.length) throw new Error(errors.join("\n"));
  return event;
}

export function appendGovernanceEvent(input: GovernanceEventInputV2, file = EVENTS_PATH): GovernanceEventV2 {
  const events = readTimelineEvents(file);
  const event = buildGovernanceEvent(input, events);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return event;
}

export function appendTimelineEvent(input: TimelineEventInput, file = EVENTS_PATH): LegacyTimelineEvent {
  const events = readTimelineEvents(file);
  if (events.some(event => event.event_id === input.event_id)) throw new Error(`Timeline event ${input.event_id} already exists.`);
  if (events.length && input.timestamp < effectiveRecordedAt(events.at(-1)!)) throw new Error("Timeline append would break UTC chronological order.");
  assertLegacyTransition(events, input);
  const withoutHash = { ...input, previous_event_hash: events.at(-1)?.event_hash ?? null };
  const event: LegacyTimelineEvent = { ...withoutHash, event_hash: eventHash(withoutHash) };
  const errors = eventSchemaErrors(event);
  if (errors.length) throw new Error(errors.join("\n"));
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return event;
}

export function validateTimeline(events = readTimelineEvents()): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const iterationLast = new Map<string, GovernanceEventType>();
  const decisions = existingDecisionIds();
  const changes = existingChangeIds();
  let previousHash: string | null = null;
  let previousRecordedAt = "";

  events.forEach((event, index) => {
    errors.push(...eventSchemaErrors(event).map(error => `${event.event_id || "unknown event"}: schema ${error}`));
    if (ids.has(event.event_id)) errors.push(`duplicate event ID: ${event.event_id}`);
    ids.add(event.event_id);
    if (event.previous_event_hash !== previousHash) errors.push(`${event.event_id}: previous_event_hash mismatch.`);
    const { event_hash: storedHash, ...withoutHash } = event;
    if (eventHash(withoutHash) !== storedHash) errors.push(`${event.event_id}: event_hash mismatch.`);
    if (isV2(event) && event.sequence !== index + 1) errors.push(`${event.event_id}: sequence must equal ${index + 1}.`);
    const occurred = effectiveOccurredAt(event);
    const recorded = effectiveRecordedAt(event);
    if (!validIso(occurred)) errors.push(`${event.event_id}: occurred_at/timestamp must be UTC ISO-8601 with milliseconds.`);
    if (!validIso(recorded)) errors.push(`${event.event_id}: recorded_at/timestamp must be UTC ISO-8601 with milliseconds.`);
    if (previousRecordedAt && recorded < previousRecordedAt) errors.push(`${event.event_id}: recording order regressed.`);

    const type = effectiveType(event);
    const last = iterationLast.get(event.iteration_id);
    if (!last && !["proposed", "compensation_proposed", "external_drift_detected", "legacy_imported"].includes(type)) {
      errors.push(`${event.event_id}: invalid first event type ${type}.`);
    }
    if (last && !modernTransitions[last]?.includes(type)) errors.push(`${event.event_id}: invalid transition ${last} -> ${type}.`);
    iterationLast.set(event.iteration_id, type);

    const decisionId = effectiveDecisionId(event);
    const changeSetId = effectiveChangeSetId(event);
    if (decisionId && !decisions.has(decisionId)) errors.push(`${event.event_id}: missing decision ${decisionId}.`);
    if (changeSetId && !changes.has(changeSetId) && type !== "legacy_imported") errors.push(`${event.event_id}: missing change set ${changeSetId}.`);

    if (isV2(event)) {
      for (const reference of event.source_refs) if (!verifyReference(reference)) errors.push(`${event.event_id}: missing source ref ${reference}.`);
      for (const reference of [...event.external.google_sync_receipts, event.external.deployment_receipt, event.rollback.rollback_payload, ...event.artifacts.manifest_refs]) {
        if (reference && !verifyReference(reference)) errors.push(`${event.event_id}: missing receipt/reference ${reference}.`);
      }
      if (event.event_type === "legacy_imported" && (!event.missing_lifecycle_stages || event.missing_lifecycle_stages.length === 0)) {
        errors.push(`${event.event_id}: legacy import must enumerate missing lifecycle stages.`);
      }
      if (event.confidence === "partial" && event.event_type !== "legacy_imported") errors.push(`${event.event_id}: partial confidence is reserved for explicit historical or audit evidence.`);
    } else {
      const payload = resolveProjectPath(event.approved_payload.path);
      if (!fs.existsSync(payload)) errors.push(`${event.event_id}: approved payload file is missing.`);
      else if (fileSha256(payload) !== event.approved_payload.sha256) errors.push(`${event.event_id}: approved payload SHA-256 mismatch.`);
      for (const reference of [event.google_sync_receipt, event.verification_receipt, event.rollback_reference]) {
        if (reference && !fs.existsSync(resolveProjectPath(reference))) errors.push(`${event.event_id}: missing receipt/reference ${reference}.`);
      }
    }
    if (secretShaped(event)) errors.push(`${event.event_id}: timeline contains a forbidden secret-shaped key.`);
    previousHash = storedHash;
    previousRecordedAt = recorded;
  });
  return errors;
}

function escapeCell(value: unknown): string {
  return String(value ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function iterationTitle(iterationId: string): string {
  const file = path.join(platformRoot, "changes", "iterations", `${iterationId}.yaml`);
  if (!fs.existsSync(file)) return iterationId;
  try { return YAML.parse(fs.readFileSync(file, "utf8"))?.title ?? iterationId; }
  catch { return iterationId; }
}

function tagExists(tag: string): boolean {
  return gitText(["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], true) !== "" || gitText(["tag", "--list", tag], true) === tag;
}

export function renderTimeline(events = readTimelineEvents()): string {
  const grouped = new Map<string, TimelineEvent[]>();
  for (const event of events) grouped.set(event.iteration_id, [...(grouped.get(event.iteration_id) ?? []), event]);
  const legacy = events.filter(event => effectiveType(event) === "legacy_imported");
  const modern = [...grouped.entries()].filter(([, items]) => !items.every(item => effectiveType(item) === "legacy_imported"));
  const rollback = events.filter(event => ["rollback_requested", "rollback_approved", "rolled_back", "compensation_proposed", "compensated"].includes(effectiveType(event)));
  const external = events.filter(event => effectiveGoogleReceipts(event).length || (isV2(event) && (event.external.deployment_receipt || event.event_type === "external_drift_detected")));
  const head = events.at(-1);

  const lines = [
    "# Governance timeline",
    "",
    "> AUTO-GENERATED — DO NOT EDIT MANUALLY. Source: `changelog/events.ndjson`.",
    "",
    "## 1. Current state",
    "",
    `- Events: ${events.length}.`,
    `- Timeline head event: \`${head?.event_id ?? "none"}\`.`,
    `- Timeline head SHA-256: \`${head?.event_hash ?? "none"}\`.`,
    `- Latest recorded iteration: \`${head?.iteration_id ?? "none"}\`.`,
    "",
    "## 2. Modern governed iterations",
    "",
    "| Occurred at | Status | Title | Iteration | Decision | Change set | Content commit | Tag | Google sync | Deployment | Rollback / compensation | Summary |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];

  for (const [iterationId, items] of modern) {
    const last = items.at(-1)!;
    const commitEvent = [...items].reverse().find(item => effectiveCommit(item));
    const tagEvent = [...items].reverse().find(item => effectiveTag(item));
    const google = [...new Set(items.flatMap(effectiveGoogleReceipts))];
    const deployment = [...items].reverse().find(item => isV2(item) && item.external.deployment_receipt) as GovernanceEventV2 | undefined;
    const reversal = items.filter(item => ["rollback_requested", "rollback_approved", "rolled_back", "compensation_proposed", "compensated"].includes(effectiveType(item))).map(effectiveType);
    const tag = tagEvent ? effectiveTag(tagEvent) : null;
    lines.push(`| ${escapeCell(effectiveOccurredAt(last))} | ${escapeCell(effectiveType(last))} | ${escapeCell(iterationTitle(iterationId))} | ${escapeCell(iterationId)} | ${escapeCell(effectiveDecisionId(last))} | ${escapeCell(effectiveChangeSetId(last))} | ${escapeCell(effectiveCommit(commitEvent ?? last))} | ${escapeCell(tag ? `${tag}${tagExists(tag) ? "" : " (missing)"}` : null)} | ${escapeCell(google.length ? google.join("; ") : null)} | ${escapeCell(deployment?.external.deployment_receipt)} | ${escapeCell(reversal.length ? reversal.join(" → ") : null)} | ${escapeCell(last.summary)} |`);
  }

  lines.push("", "## 3. Legacy imported history", "", "| Historical occurred_at | Imported recorded_at | Decision | Change set | Git commit | Confidence | Missing lifecycle stages | Summary |", "|---|---|---|---|---|---|---|---|");
  for (const event of legacy) {
    const item = event as GovernanceEventV2;
    lines.push(`| ${escapeCell(item.occurred_at)} | ${escapeCell(item.recorded_at)} | ${escapeCell(item.decision_id)} | ${escapeCell(item.change_set_id)} | ${escapeCell(item.git.content_commit_hash)} | ${escapeCell(item.confidence)} | ${escapeCell(item.missing_lifecycle_stages?.join(", "))} | ${escapeCell(item.summary)} |`);
  }

  lines.push("", "## 4. Rollbacks and compensations", "");
  if (!rollback.length) lines.push("- No rollback or compensation events recorded.");
  else {
    lines.push("| Occurred at | Event | Iteration | Type | Compensates | Restores hash | Dependency check |", "|---|---|---|---|---|---|---|");
    for (const event of rollback) {
      const item = event as GovernanceEventV2;
      lines.push(`| ${escapeCell(effectiveOccurredAt(event))} | ${escapeCell(event.event_id)} | ${escapeCell(event.iteration_id)} | ${escapeCell(effectiveType(event))} | ${escapeCell(item.rollback?.compensates_iteration_id)} | ${escapeCell(item.rollback?.restores_hash)} | ${escapeCell(item.rollback?.dependency_check)} |`);
    }
  }

  lines.push("", "## 5. External sync and deployments", "");
  if (!external.length) lines.push("- No external sync or deployment evidence is linked in the event log.");
  else {
    lines.push("| Occurred at | Iteration | Type | Google receipts | Deployment receipt | Production URL |", "|---|---|---|---|---|---|");
    for (const event of external) {
      const item = isV2(event) ? event : null;
      lines.push(`| ${escapeCell(effectiveOccurredAt(event))} | ${escapeCell(event.iteration_id)} | ${escapeCell(effectiveType(event))} | ${escapeCell(effectiveGoogleReceipts(event).join("; ") || null)} | ${escapeCell(item?.external.deployment_receipt)} | ${escapeCell(item?.external.production_url)} |`);
    }
  }

  const partial = legacy.filter(event => (event as GovernanceEventV2).confidence === "partial");
  lines.push("", "## 6. Open issues", "");
  if (partial.length) lines.push(`- Partial legacy links: ${partial.map(event => `\`${event.event_id}\``).join(", ")}.`);
  else lines.push("- No partial legacy links.");
  lines.push("- Deployment state remains unverified when no deployment receipt exists.");
  lines.push("- Review artifacts marked `pending_archive` are not fully portable until durable storage is recorded.", "");
  return lines.join("\n");
}

export function generateTimeline(output = TIMELINE_PATH): string {
  const events = readTimelineEvents();
  const errors = validateTimeline(events);
  if (errors.length) throw new Error(errors.join("\n"));
  atomicWrite(output, renderTimeline(events));
  return output;
}

export function eventsPrefixHash(byteLength: number, file = EVENTS_PATH): string {
  return sha256(fs.readFileSync(file).subarray(0, byteLength));
}

export function eventsFileRelative(): string {
  return path.relative(projectRoot, EVENTS_PATH).replaceAll(path.sep, "/");
}
