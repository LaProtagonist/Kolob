import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";

export const EVENTS_PATH = path.join(platformRoot, "changelog", "events.ndjson");
export const TIMELINE_PATH = path.join(platformRoot, "changelog", "TIMELINE.md");

export const ITERATION_STATUSES = ["proposed", "approved", "applied", "verified", "rejected", "superseded", "failed", "rolled_back"] as const;
export type IterationStatus = typeof ITERATION_STATUSES[number];

export type TimelineEvent = {
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

export type TimelineEventInput = Omit<TimelineEvent, "previous_event_hash" | "event_hash">;

const allowedTransitions: Record<IterationStatus, IterationStatus[]> = {
  proposed: ["approved", "rejected", "failed"],
  approved: ["applied", "rejected", "superseded", "failed"],
  applied: ["verified", "rolled_back", "failed"],
  verified: ["rolled_back", "superseded"],
  rejected: [],
  superseded: [],
  failed: [],
  rolled_back: [],
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function eventHash(event: Omit<TimelineEvent, "event_hash">) { return crypto.createHash("sha256").update(canonical(event)).digest("hex"); }
export function readTimelineEvents(file = EVENTS_PATH): TimelineEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as TimelineEvent; }
    catch (error) { throw new Error(`Invalid timeline JSON on line ${index + 1}: ${(error as Error).message}`); }
  });
}

function assertTransition(events: TimelineEvent[], input: TimelineEventInput) {
  const prior = [...events].reverse().find(event => event.iteration_id === input.iteration_id);
  if (!prior) {
    if (input.lifecycle_status !== "proposed") throw new Error(`First event for ${input.iteration_id} must be proposed.`);
    return;
  }
  if (!allowedTransitions[prior.lifecycle_status].includes(input.lifecycle_status)) throw new Error(`Invalid lifecycle transition for ${input.iteration_id}: ${prior.lifecycle_status} -> ${input.lifecycle_status}.`);
}

function payloadAbsolute(relativePath: string) { return path.resolve(platformRoot, "..", relativePath); }
function existingChangeIds() {
  const changesDir = path.join(platformRoot, "changes");
  return new Set(fs.readdirSync(changesDir, { recursive: true, encoding: "utf8" }).filter(item => item.endsWith(".yaml")).map(item => {
    try { return YAML.parse(fs.readFileSync(path.join(changesDir, item), "utf8"))?.change_id as string | undefined; }
    catch { return undefined; }
  }).filter(Boolean) as string[]);
}

function eventSchemaErrors(event: TimelineEvent) {
  const schema = JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", "timeline-event.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(event) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

export function validateTimeline(events = readTimelineEvents()) {
  const errors: string[] = [];
  const ids = new Set<string>();
  let previousHash: string | null = null;
  let previousTimestamp = "";
  const iterationLast = new Map<string, IterationStatus>();
  const decisions = new Set((YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"))?.decisions ?? []).map((item: { id: string }) => item.id));
  const changeIds = existingChangeIds();
  for (const event of events) {
    errors.push(...eventSchemaErrors(event).map(error => `${event.event_id || "unknown event"}: schema ${error}`));
    if (ids.has(event.event_id)) errors.push(`duplicate event ID: ${event.event_id}`);
    ids.add(event.event_id);
    if (event.previous_event_hash !== previousHash) errors.push(`${event.event_id}: previous_event_hash mismatch.`);
    const { event_hash: storedHash, ...withoutHash } = event;
    if (eventHash(withoutHash) !== storedHash) errors.push(`${event.event_id}: event_hash mismatch.`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.timestamp)) errors.push(`${event.event_id}: timestamp must be UTC ISO-8601 with milliseconds.`);
    if (previousTimestamp && event.timestamp < previousTimestamp) errors.push(`${event.event_id}: events are not sorted by UTC timestamp.`);
    const last = iterationLast.get(event.iteration_id);
    if (!last && event.lifecycle_status !== "proposed") errors.push(`${event.event_id}: first iteration event must be proposed.`);
    if (last && !allowedTransitions[last].includes(event.lifecycle_status)) errors.push(`${event.event_id}: invalid transition ${last} -> ${event.lifecycle_status}.`);
    iterationLast.set(event.iteration_id, event.lifecycle_status);
    if (!decisions.has(event.decision_id)) errors.push(`${event.event_id}: missing decision ${event.decision_id}.`);
    if (!changeIds.has(event.change_set_id)) errors.push(`${event.event_id}: missing change set ${event.change_set_id}.`);
    const payload = payloadAbsolute(event.approved_payload.path);
    if (!fs.existsSync(payload)) errors.push(`${event.event_id}: approved payload file is missing.`);
    else if (crypto.createHash("sha256").update(fs.readFileSync(payload)).digest("hex") !== event.approved_payload.sha256) errors.push(`${event.event_id}: approved payload SHA-256 mismatch.`);
    for (const reference of [event.google_sync_receipt, event.verification_receipt, event.rollback_reference]) if (reference && !fs.existsSync(payloadAbsolute(reference))) errors.push(`${event.event_id}: missing receipt/reference ${reference}.`);
    if (/refresh_token|client_secret|access_token/i.test(JSON.stringify(event))) errors.push(`${event.event_id}: timeline contains a forbidden secret key.`);
    previousHash = storedHash;
    previousTimestamp = event.timestamp;
  }
  return errors;
}

export function appendTimelineEvent(input: TimelineEventInput, file = EVENTS_PATH) {
  const events = readTimelineEvents(file);
  if (events.some(event => event.event_id === input.event_id)) throw new Error(`Timeline event ${input.event_id} already exists.`);
  if (events.length && input.timestamp < events[events.length - 1].timestamp) throw new Error("Timeline append would break UTC chronological order.");
  assertTransition(events, input);
  const withoutHash = { ...input, previous_event_hash: events.at(-1)?.event_hash ?? null };
  const event: TimelineEvent = { ...withoutHash, event_hash: eventHash(withoutHash) };
  const schemaErrors = eventSchemaErrors(event);
  if (schemaErrors.length) throw new Error(schemaErrors.join("\n"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return event;
}

function escapeCell(value: unknown) { return String(value ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " "); }
export function renderTimeline(events = readTimelineEvents()) {
  const lines = [
    "# Хронологический журнал governed iterations",
    "",
    "> Этот файл генерируется из `events.ndjson` и не редактируется вручную. История до внедрения NDJSON остаётся в `changes.log`, датированных journal-файлах, backups и sync receipts; отсутствующие legacy-поля не восстанавливаются по догадкам.",
    "",
    "| UTC timestamp | Event | Iteration | Status | Action | Decision | Change set | Validation | Summary |",
    "|---|---|---|---|---|---|---|---|---|",
    ...events.map(event => `| ${escapeCell(event.timestamp)} | ${escapeCell(event.event_id)} | ${escapeCell(event.iteration_id)} | ${escapeCell(event.lifecycle_status)} | ${escapeCell(event.action)} | ${escapeCell(event.decision_id)} | ${escapeCell(event.change_set_id)} | ${escapeCell(event.validation_result)} | ${escapeCell(event.summary)} |`),
    "",
    "## Проверка цепочки",
    "",
    `- Событий: ${events.length}.`,
    `- Последний event hash: \`${events.at(-1)?.event_hash ?? "none"}\`.`,
    "- Полная машинная запись, approved payload SHA-256, before/after hashes и rollback reference находятся в `events.ndjson`.",
    "",
  ];
  return lines.join("\n");
}

export function generateTimeline(output = TIMELINE_PATH) {
  const events = readTimelineEvents();
  const errors = validateTimeline(events);
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(output, renderTimeline(events));
  return output;
}
