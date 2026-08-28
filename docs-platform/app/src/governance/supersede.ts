import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { buildContext } from "./context.js";
import {
  appendGovernanceEvent,
  buildGovernanceEvent,
  effectiveType,
  isV2,
  readTimelineEvents,
  type GovernanceEventInputV2,
  type GovernanceEventV2,
  type TimelineEvent,
} from "./timeline.js";
import { relativeToProject } from "./util.js";

// A superseded iteration keeps every historical event, receipt and external artifact exactly as recorded.
// The event only states that its local development line continues in another governed iteration.
// An unsealed applied iteration is still a local development line. It must be
// possible to supersede it without manufacturing a verification event for a
// state that has deliberately been replaced before any content commit.
export const SUPERSEDE_ALLOWED_FROM = ["approved", "previewed", "applied", "verified", "synced"] as const;

export type SupersedeInput = {
  iterationId: string;
  supersededByIterationId: string;
  reason: string;
  actor?: string;
  occurredAt?: string;
};

function iterationFile(iterationId: string): string {
  return path.join(platformRoot, "changes", "iterations", `${iterationId}.yaml`);
}

function readIterationMetadata(iterationId: string): Record<string, any> {
  const file = iterationFile(iterationId);
  if (!fs.existsSync(file)) throw new Error(`Unknown iteration ${iterationId}: ${relativeToProject(file)} does not exist.`);
  return YAML.parse(fs.readFileSync(file, "utf8")) ?? {};
}

function lastEventFor(events: TimelineEvent[], iterationId: string): TimelineEvent | undefined {
  return [...events].reverse().find(event => event.iteration_id === iterationId);
}

export function supersedeEventId(iterationId: string): string {
  return `EVT-${iterationId}-SUPERSEDED`;
}

export function supersedeMarker(supersededByIterationId: string): string {
  return `superseded_by=${supersededByIterationId}`;
}

export function supersededByOf(event: GovernanceEventV2): string | null {
  if (event.event_type !== "superseded") return null;
  const match = event.rollback.dependency_check?.match(/superseded_by=([A-Za-z0-9._-]+)/);
  return match ? match[1] : null;
}

export function buildSupersedeInput(input: SupersedeInput, events = readTimelineEvents()): GovernanceEventInputV2 {
  const iterationId = input.iterationId?.trim();
  const supersededBy = input.supersededByIterationId?.trim();
  const reason = input.reason?.trim();
  if (!iterationId) throw new Error("iteration_id is required.");
  if (!supersededBy) throw new Error("superseded_by_iteration_id is required.");
  if (!reason) throw new Error("reason is required for a superseded event.");
  if (iterationId === supersededBy) throw new Error(`Iteration ${iterationId} cannot supersede itself.`);

  const source = readIterationMetadata(iterationId);
  const target = readIterationMetadata(supersededBy);
  const targetLast = lastEventFor(events, supersededBy);
  if (targetLast && ["superseded", "rejected", "failed", "rolled_back"].includes(effectiveType(targetLast))) {
    throw new Error(`Superseding iteration ${supersededBy} is itself terminal (${effectiveType(targetLast)}).`);
  }

  const last = lastEventFor(events, iterationId);
  if (!last) throw new Error(`Iteration ${iterationId} has no timeline events; nothing to supersede.`);
  const state = effectiveType(last);
  if (state === "superseded") throw new Error(`Iteration ${iterationId} is already superseded.`);
  if (!SUPERSEDE_ALLOWED_FROM.includes(state as typeof SUPERSEDE_ALLOWED_FROM[number])) {
    throw new Error(`Invalid v2 transition for ${iterationId}: ${state} -> superseded. Supersede is only allowed from ${SUPERSEDE_ALLOWED_FROM.join(", ")}.`);
  }
  if (state === "applied" && isV2(last) && last.git.content_commit_hash) {
    throw new Error(`Applied iteration ${iterationId} already has a content commit and must be verified or compensated rather than superseded.`);
  }
  if (events.some(event => event.event_id === supersedeEventId(iterationId))) throw new Error(`Iteration ${iterationId} is already superseded.`);

  const lastRecorded = events.at(-1);
  const lastRecordedAt = lastRecorded ? (isV2(lastRecorded) ? lastRecorded.recorded_at : (lastRecorded as any).timestamp) : "1970-01-01T00:00:00.000Z";
  const now = input.occurredAt ? Date.parse(input.occurredAt) : Date.now();
  const recordedAt = new Date(Math.max(now, Date.parse(lastRecordedAt) + 1)).toISOString();
  const occurredAt = input.occurredAt ?? recordedAt;
  const lastV2 = isV2(last) ? last : null;
  const targetRef = relativeToProject(iterationFile(supersededBy));
  const sourceRef = relativeToProject(iterationFile(iterationId));

  const eventInput: GovernanceEventInputV2 = {
    event_id: supersedeEventId(iterationId),
    event_type: "superseded",
    occurred_at: occurredAt,
    recorded_at: recordedAt,
    iteration_id: iterationId,
    proposal_id: source.proposal_id ?? lastV2?.proposal_id ?? null,
    decision_id: source.decision_id ?? lastV2?.decision_id ?? null,
    change_set_id: source.change_set_id ?? lastV2?.change_set_id ?? null,
    actor: input.actor ?? "Codex",
    tool: "iteration:supersede",
    scope: `Local development line of ${iterationId} continues in ${supersededBy}; historical events, receipts and external artifacts remain unchanged. ${supersedeMarker(supersededBy)}`,
    summary: `${source.title ?? iterationId} superseded by ${target.title ?? supersededBy} (${supersededBy}). Reason: ${reason}`,
    approved_payload_sha256: source.approved_payload_sha256 ?? lastV2?.approved_payload_sha256 ?? null,
    before_hash: lastV2?.after_hash ?? source.after_state_sha256 ?? null,
    after_hash: lastV2?.after_hash ?? source.after_state_sha256 ?? null,
    affected_document_ids: [],
    affected_section_ids: ["governance.lifecycle.superseded"],
    source_refs: [sourceRef, targetRef],
    git: { content_commit_hash: null, seal_commit_ref: null, iteration_tag: null, commit_message_verified: null, trailers_verified: null },
    external: {
      // The superseded event never rolls back, deletes or edits an external publication.
      google_sync_receipts: [],
      deployment_receipt: null,
      remote_readback_hash: null,
      production_url: null,
    },
    rollback: {
      rollback_payload: null,
      compensates_iteration_id: null,
      restores_hash: null,
      dependency_check: `No rollback: external artifacts published by ${iterationId} stay as recorded; ${supersedeMarker(supersededBy)}`,
    },
    artifacts: { manifest_refs: [] },
    confidence: "exact",
  };
  return eventInput;
}

export function buildSupersedeEvent(input: SupersedeInput, events = readTimelineEvents()): GovernanceEventV2 {
  return buildGovernanceEvent(buildSupersedeInput(input, events), events);
}

export function supersedeIteration(input: SupersedeInput, options: { rebuildContext?: boolean } = {}): GovernanceEventV2 {
  const events = readTimelineEvents();
  const eventInput = buildSupersedeInput(input, events);
  buildGovernanceEvent(eventInput, events); // full transition + schema validation before touching the log
  const appended = appendGovernanceEvent(eventInput);
  if (options.rebuildContext !== false) buildContext();
  return appended;
}
