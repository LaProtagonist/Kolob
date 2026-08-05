import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import {
  appendGovernanceEvent,
  effectiveType,
  isV2,
  readTimelineEvents,
  type GovernanceEventInputV2,
  type GovernanceEventV2,
} from "./timeline.js";
import { git, gitText, projectRoot, readYaml, resolveProjectPath } from "./util.js";

export const GIT_LINK_INDEX_PATH = path.join(platformRoot, "changelog", "git-link-index.yaml");
export const LEGACY_HISTORY_INDEX_PATH = path.join(platformRoot, "changelog", "legacy-history-index.yaml");

export type GitLink = {
  iteration_id: string;
  decision_id: string;
  change_set_id: string;
  verification_receipt: string;
  approved_payload_hash: string;
  before_hash: string | null;
  after_hash: string;
  probable_git_commit: string;
  commit_message: string;
  google_sync_receipt: string | null;
  deployment_receipt: string | null;
  rollback_payload: string | null;
  tag: string;
  confidence: "exact" | "high" | "partial";
  legacy_without_trailers: boolean;
};

export type GitLinkIndex = {
  schema_version: number;
  generated_from: {
    task_start_events_sha256: string;
    task_start_events_bytes: number;
    preimplementation_events_sha256: string;
    preimplementation_events_bytes: number;
  };
  iterations: GitLink[];
};

type LegacyEntry = {
  legacy_id: string;
  occurred_at: string;
  recorded_at: string;
  decision_id: string | null;
  change_set_id: string | null;
  git_commit_hash: string;
  source_refs: string[];
  summary: string;
  confidence: "exact" | "high" | "partial";
  affected_document_ids: string[];
  google_sync_receipts?: string[];
  missing_lifecycle_stages: string[];
};

type LegacyIndex = { schema_version: number; imported_at: string; entries: LegacyEntry[] };

export function readGitLinkIndex(): GitLinkIndex {
  return readYaml<GitLinkIndex>(GIT_LINK_INDEX_PATH);
}

export function readLegacyHistoryIndex(): LegacyIndex {
  return readYaml<LegacyIndex>(LEGACY_HISTORY_INDEX_PATH);
}

function blankEvent(input: Pick<GovernanceEventInputV2, "event_id" | "event_type" | "occurred_at" | "recorded_at" | "iteration_id" | "summary"> & Partial<GovernanceEventInputV2>): GovernanceEventInputV2 {
  return {
    proposal_id: null,
    decision_id: null,
    change_set_id: null,
    actor: "Codex governance migration",
    tool: "governance-history-v2",
    scope: "Governance history metadata only; no business content mutation.",
    approved_payload_sha256: null,
    before_hash: null,
    after_hash: null,
    affected_document_ids: [],
    affected_section_ids: [],
    source_refs: [],
    git: {
      content_commit_hash: null,
      seal_commit_ref: null,
      iteration_tag: null,
      commit_message_verified: null,
      trailers_verified: null,
    },
    external: {
      google_sync_receipts: [],
      deployment_receipt: null,
      remote_readback_hash: null,
      production_url: null,
    },
    rollback: {
      rollback_payload: null,
      compensates_iteration_id: null,
      restores_hash: null,
      dependency_check: null,
    },
    artifacts: { manifest_refs: [] },
    ...input,
  };
}

export function verifyGitLink(link: GitLink): string[] {
  const errors: string[] = [];
  const commit = gitText(["rev-parse", `${link.probable_git_commit}^{commit}`], true);
  if (commit !== link.probable_git_commit) errors.push(`${link.iteration_id}: commit does not resolve exactly.`);
  const subject = gitText(["show", "-s", "--format=%s", link.probable_git_commit], true);
  if (subject !== link.commit_message) errors.push(`${link.iteration_id}: commit subject differs: ${subject || "missing"}.`);
  for (const reference of [link.verification_receipt, link.rollback_payload, link.google_sync_receipt, link.deployment_receipt]) {
    if (reference && !fs.existsSync(resolveProjectPath(reference))) errors.push(`${link.iteration_id}: missing evidence ${reference}.`);
  }
  const verified = readTimelineEvents().find(event => event.iteration_id === link.iteration_id && effectiveType(event) === "verified");
  if (!verified) errors.push(`${link.iteration_id}: verified event is missing.`);
  else {
    const approvedHash = isV2(verified) ? verified.approved_payload_sha256 : verified.approved_payload.sha256;
    if (approvedHash !== link.approved_payload_hash) errors.push(`${link.iteration_id}: approved payload hash mismatch.`);
    if (verified.after_hash !== link.after_hash) errors.push(`${link.iteration_id}: after hash mismatch.`);
  }
  return errors;
}

export function importLegacyHistory(): GovernanceEventV2[] {
  const index = readLegacyHistoryIndex();
  if (index.schema_version !== 2) throw new Error(`Unsupported legacy history index schema ${index.schema_version}.`);
  const existing = new Set(readTimelineEvents().map(event => event.event_id));
  const appended: GovernanceEventV2[] = [];
  for (const entry of index.entries) {
    const eventId = `EVT-${entry.legacy_id}-IMPORTED`;
    if (existing.has(eventId)) continue;
    const event = appendGovernanceEvent(blankEvent({
      event_id: eventId,
      event_type: "legacy_imported",
      occurred_at: entry.occurred_at,
      recorded_at: entry.recorded_at,
      iteration_id: `ITR-${entry.legacy_id}`,
      decision_id: entry.decision_id,
      change_set_id: entry.change_set_id,
      summary: entry.summary,
      affected_document_ids: entry.affected_document_ids,
      source_refs: entry.source_refs,
      git: {
        content_commit_hash: entry.git_commit_hash,
        seal_commit_ref: null,
        iteration_tag: null,
        commit_message_verified: true,
        trailers_verified: false,
      },
      external: {
        google_sync_receipts: entry.google_sync_receipts ?? [],
        deployment_receipt: null,
        remote_readback_hash: null,
        production_url: null,
      },
      confidence: entry.confidence,
      missing_lifecycle_stages: entry.missing_lifecycle_stages,
    }));
    appended.push(event);
    existing.add(eventId);
  }
  return appended;
}

function commitOccurredAt(commit: string): string {
  return new Date(gitText(["show", "-s", "--format=%aI", commit])).toISOString();
}

function artifactManifestFor(iterationId: string): string[] {
  const relative = `docs-platform/changelog/artifacts/${iterationId}.yaml`;
  return fs.existsSync(resolveProjectPath(relative)) ? [relative] : [];
}

export function backfillCommittedEvents(recordedBase = "2026-08-05T17:01:00.000Z"): GovernanceEventV2[] {
  const index = readGitLinkIndex();
  if (index.schema_version !== 2) throw new Error(`Unsupported Git-link index schema ${index.schema_version}.`);
  const existing = new Set(readTimelineEvents().map(event => event.event_id));
  const appended: GovernanceEventV2[] = [];
  for (const [offset, link] of index.iterations.entries()) {
    if (link.confidence !== "exact") continue;
    const errors = verifyGitLink(link);
    if (errors.length) throw new Error(errors.join("\n"));
    const eventId = `EVT-${link.iteration_id}-COMMITTED-BACKFILL`;
    if (existing.has(eventId)) continue;
    const iteration = readYaml<any>(path.join(platformRoot, "changes", "iterations", `${link.iteration_id}.yaml`));
    const event = appendGovernanceEvent(blankEvent({
      event_id: eventId,
      event_type: "committed",
      occurred_at: commitOccurredAt(link.probable_git_commit),
      recorded_at: new Date(Date.parse(recordedBase) + offset).toISOString(),
      iteration_id: link.iteration_id,
      proposal_id: iteration.proposal_id ?? null,
      decision_id: link.decision_id,
      change_set_id: link.change_set_id,
      summary: `Exact historical Git linkage backfilled for ${link.iteration_id}; the original commit predates mandatory governance trailers.`,
      approved_payload_sha256: link.approved_payload_hash,
      before_hash: link.before_hash,
      after_hash: link.after_hash,
      affected_document_ids: [],
      source_refs: [
        `docs-platform/changes/iterations/${link.iteration_id}.yaml`,
        link.verification_receipt,
        "docs-platform/changelog/git-link-index.yaml",
        `commit:${link.probable_git_commit}`,
      ],
      git: {
        content_commit_hash: link.probable_git_commit,
        seal_commit_ref: null,
        iteration_tag: link.tag,
        commit_message_verified: true,
        trailers_verified: false,
      },
      external: {
        google_sync_receipts: link.google_sync_receipt ? [link.google_sync_receipt] : [],
        deployment_receipt: link.deployment_receipt,
        remote_readback_hash: null,
        production_url: null,
      },
      rollback: {
        rollback_payload: link.rollback_payload,
        compensates_iteration_id: null,
        restores_hash: link.before_hash,
        dependency_check: "historical suffix order preserved; no rollback requested",
      },
      artifacts: { manifest_refs: artifactManifestFor(link.iteration_id) },
      confidence: "exact",
    }));
    appended.push(event);
    existing.add(eventId);
  }
  return appended;
}

export function annotatedTagMessage(link: GitLink, timelineHeadHash: string): string {
  return [
    `Governance seal for ${link.iteration_id}`,
    "",
    `Iteration-ID: ${link.iteration_id}`,
    `Decision-ID: ${link.decision_id}`,
    `Change-Set-ID: ${link.change_set_id}`,
    `Approved-Payload-SHA256: ${link.approved_payload_hash}`,
    `Before-State-SHA256: ${link.before_hash ?? "null"}`,
    `After-State-SHA256: ${link.after_hash}`,
    `Timeline-Head-SHA256: ${timelineHeadHash}`,
  ].join("\n");
}

export function createHistoricalIterationTags(): string[] {
  const events = readTimelineEvents();
  const created: string[] = [];
  for (const link of readGitLinkIndex().iterations) {
    if (link.confidence !== "exact") continue;
    const event = events.find(item => item.event_id === `EVT-${link.iteration_id}-COMMITTED-BACKFILL`);
    if (!event) throw new Error(`${link.iteration_id}: committed backfill event is missing; tag not created.`);
    const existing = gitText(["rev-parse", `${link.tag}^{commit}`], true);
    if (existing) {
      if (existing !== link.probable_git_commit) throw new Error(`${link.tag} already exists on unexpected commit ${existing}; refusing overwrite.`);
      continue;
    }
    const message = annotatedTagMessage(link, event.event_hash);
    git(["tag", "--annotate", link.tag, link.probable_git_commit, "--message", message]);
    created.push(link.tag);
  }
  return created;
}

export function verifyHistoricalTags(): string[] {
  const errors: string[] = [];
  const events = readTimelineEvents();
  for (const link of readGitLinkIndex().iterations.filter(item => item.confidence === "exact")) {
    const target = gitText(["rev-parse", `${link.tag}^{commit}`], true);
    if (!target) errors.push(`${link.tag}: annotated tag is missing.`);
    else if (target !== link.probable_git_commit) errors.push(`${link.tag}: points to ${target}, expected ${link.probable_git_commit}.`);
    const objectType = gitText(["cat-file", "-t", `refs/tags/${link.tag}`], true);
    if (target && objectType !== "tag") errors.push(`${link.tag}: must be annotated, found ${objectType || "unknown"}.`);
    const event = events.find(item => item.event_id === `EVT-${link.iteration_id}-COMMITTED-BACKFILL`);
    if (!event) errors.push(`${link.iteration_id}: committed event is missing.`);
    else {
      const annotation = gitText(["for-each-ref", `refs/tags/${link.tag}`, "--format=%(contents)"], true);
      const expected = annotatedTagMessage(link, event.event_hash);
      if (target && annotation.trim() !== expected.trim()) errors.push(`${link.tag}: annotation differs from governed metadata.`);
    }
  }
  return errors;
}

export function writeGitLinkAuditMarkdown(): void {
  const rows = readGitLinkIndex().iterations.map(link => {
    const issues = link.legacy_without_trailers ? "Original commit predates required trailers; linkage proven by content/receipt evidence." : "—";
    return `| ${link.iteration_id} | ${link.decision_id} | ${link.change_set_id} | ${link.after_hash} | ${link.probable_git_commit} | ${link.confidence} | ${link.tag} | ${issues} |`;
  });
  const output = [
    "# Git link audit",
    "",
    "> Generated from `git-link-index.yaml`; historical events and commits were not rewritten.",
    "",
    "| Iteration | Decision | Change set | After hash | Matched commit | Confidence | Tag | Issues |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "The first seven rows are the modern iterations present at the beginning of the Governance History v2 audit. The premises-preparation iteration was committed concurrently during the read-only audit and is reported separately as an eighth exact link.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(platformRoot, "changelog", "GIT_LINK_AUDIT.md"), output);
}

