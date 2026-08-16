import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { CAPEX_GOVERNANCE_PROJECTION_PATH, writeCapexGovernanceProjection } from "../capex/governance-projection.js";
import { validateArtifacts } from "./artifacts.js";
import { buildContext, commitTrailers, contextValidationErrors } from "./context.js";
import { validateExternalReceipts } from "./external.js";
import { annotatedTagMessage, verifyHistoricalTags, type GitLink } from "./history.js";
import { validateImmutability } from "./immutability.js";
import { createIterationSnapshot, validateSnapshots } from "./snapshots.js";
import {
  appendGovernanceEvent,
  effectiveType,
  isV2,
  readTimelineEvents,
  validateTimeline,
  type GovernanceEventV2,
  type TimelineEvent,
} from "./timeline.js";
import { fileSha256, git, gitText, projectRoot, resolveProjectPath, scopeHash } from "./util.js";

export const REQUIRED_TRAILERS = [
  "Iteration-ID",
  "Decision-ID",
  "Change-Set-ID",
  "Approved-Payload-SHA256",
  "Before-State-SHA256",
  "After-State-SHA256",
  "Timeline-Head-SHA256",
] as const;

export type GovernedIteration = {
  schema_version: 2;
  iteration_id: string;
  proposal_id: string;
  decision_id: string;
  change_set_id: string;
  title: string;
  status: string;
  approved_by: string;
  approved_at: string;
  actor: string;
  scope: string;
  approved_payload_path: string;
  approved_payload_sha256: string;
  before_state_sha256: string;
  after_state_sha256: string;
  affected_document_ids: string[];
  affected_section_ids: string[];
  state_hash_paths: string[];
  content_paths: string[];
  seal_paths: string[];
  allowed_dirty_paths: string[];
  rollback_payload: string | null;
};

export function iterationPath(iterationId: string): string {
  return path.join(platformRoot, "changes", "iterations", `${iterationId}.yaml`);
}

export function loadGovernedIteration(iterationId: string): GovernedIteration {
  const file = iterationPath(iterationId);
  if (!fs.existsSync(file)) throw new Error(`Iteration ${iterationId} is missing.`);
  const value = YAML.parse(fs.readFileSync(file, "utf8")) as GovernedIteration;
  if (value.schema_version !== 2) throw new Error(`Iteration ${iterationId} does not use Governance History v2.`);
  if (value.iteration_id !== iterationId) throw new Error(`Iteration file ID mismatch for ${iterationId}.`);
  const payload = YAML.parse(fs.readFileSync(resolveProjectPath(value.approved_payload_path), "utf8"));
  return {
    ...value,
    state_hash_paths: value.state_hash_paths ?? payload.state_hash_paths,
    content_paths: value.content_paths ?? payload.content_paths,
    seal_paths: value.seal_paths ?? payload.seal_paths,
    allowed_dirty_paths: value.allowed_dirty_paths ?? payload.allowed_dirty_paths,
  };
}

export function parsePorcelainPaths(status: string): string[] {
  status = status.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!status) return [];
  return status.split("\n").filter(Boolean).map(line => {
    const raw = line.slice(3);
    const renamed = raw.includes(" -> ") ? raw.split(" -> ").at(-1)! : raw;
    return renamed.replace(/^"|"$/g, "");
  });
}

function statusPaths(): string[] {
  const status = String(git(["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8", allowFailure: true }));
  return parsePorcelainPaths(status);
}

function pathMatches(candidate: string, allowed: string): boolean {
  const clean = allowed.replace(/\/$/, "");
  return candidate === clean || candidate.startsWith(`${clean}/`);
}

export function scopeErrors(iteration: GovernedIteration, phase: "content" | "seal"): string[] {
  const errors: string[] = [];
  const allowed = phase === "content"
    ? [...iteration.content_paths, ...iteration.seal_paths, ...iteration.allowed_dirty_paths]
    : [...iteration.seal_paths, ...iteration.allowed_dirty_paths];
  for (const candidate of statusPaths()) {
    if (!allowed.some(item => pathMatches(candidate, item))) errors.push(`Dirty path is outside ${phase} scope: ${candidate}.`);
    if (phase === "seal" && iteration.content_paths.some(item => pathMatches(candidate, item)) && !iteration.seal_paths.some(item => pathMatches(candidate, item))) {
      errors.push(`Unsealed content change remains after content commit: ${candidate}.`);
    }
  }
  const staged = gitText(["diff", "--cached", "--name-only"], true).split("\n").filter(Boolean);
  if (staged.length) errors.push(`Pre-existing staged paths are forbidden: ${staged.join(", ")}.`);
  return errors;
}

function iterationEvents(iterationId: string): TimelineEvent[] {
  return readTimelineEvents().filter(event => event.iteration_id === iterationId);
}

export function lifecycleErrors(iteration: GovernedIteration): string[] {
  const errors: string[] = [];
  if (iteration.status !== "approved") errors.push(`${iteration.iteration_id}: iteration is not approved.`);
  const payload = resolveProjectPath(iteration.approved_payload_path);
  if (!fs.existsSync(payload)) errors.push(`${iteration.iteration_id}: approved payload is missing.`);
  else if (fileSha256(payload) !== iteration.approved_payload_sha256) errors.push(`${iteration.iteration_id}: approved payload SHA-256 mismatch.`);
  const events = iterationEvents(iteration.iteration_id);
  for (const type of ["proposed", "approved", "applied", "verified"] as const) {
    if (!events.some(event => effectiveType(event) === type)) errors.push(`${iteration.iteration_id}: ${type} event is missing.`);
  }
  const verified = [...events].reverse().find(event => effectiveType(event) === "verified");
  if (verified) {
    const payloadHash = isV2(verified) ? verified.approved_payload_sha256 : verified.approved_payload.sha256;
    if (payloadHash !== iteration.approved_payload_sha256) errors.push(`${iteration.iteration_id}: verified payload SHA-256 mismatch.`);
    if (verified.before_hash !== iteration.before_state_sha256) errors.push(`${iteration.iteration_id}: verified before-state SHA-256 mismatch.`);
    if (verified.after_hash !== iteration.after_state_sha256) errors.push(`${iteration.iteration_id}: verified after-state SHA-256 mismatch.`);
  }
  const actualAfter = scopeHash(iteration.state_hash_paths);
  if (actualAfter !== iteration.after_state_sha256) errors.push(`${iteration.iteration_id}: current governed scope hash ${actualAfter} differs from approved after hash ${iteration.after_state_sha256}.`);
  return errors;
}

function trailerValues(iteration: GovernedIteration, timelineHeadHash: string): Record<typeof REQUIRED_TRAILERS[number], string> {
  return {
    "Iteration-ID": iteration.iteration_id,
    "Decision-ID": iteration.decision_id,
    "Change-Set-ID": iteration.change_set_id,
    "Approved-Payload-SHA256": iteration.approved_payload_sha256,
    "Before-State-SHA256": iteration.before_state_sha256,
    "After-State-SHA256": iteration.after_state_sha256,
    "Timeline-Head-SHA256": timelineHeadHash,
  };
}

function trailerBlock(values: Record<string, string>): string {
  return REQUIRED_TRAILERS.map(key => `${key}: ${values[key]}`).join("\n");
}

export function verifyRequiredTrailers(commit: string, iteration: GovernedIteration, timelineHeadHash: string): string[] {
  const actual = commitTrailers(commit);
  const expected = trailerValues(iteration, timelineHeadHash);
  return REQUIRED_TRAILERS.flatMap(key => actual[key] === expected[key] ? [] : [`${commit}: trailer ${key} expected ${expected[key]}, got ${actual[key] ?? "missing"}.`]);
}

function ensureNoForbiddenContentPaths(iteration: GovernedIteration): void {
  if (iteration.iteration_id !== "ITR-GOVERNANCE-HISTORY-V2-2026-08-05-01") return;
  const forbidden = [
    "docs-platform/00-foundation.md",
    "docs-platform/01-business-model-architecture.md",
    "docs-platform/working/capex-",
    "docs-platform/working/investor-start-model.yaml",
    "src/",
    "public/",
    "index.html",
  ];
  const offending = iteration.content_paths.filter(candidate => forbidden.some(item => candidate === item || candidate.startsWith(item)));
  if (offending.length) throw new Error(`Governance infrastructure iteration contains forbidden business/site paths: ${offending.join(", ")}.`);
}

function verifiedEvent(iteration: GovernedIteration): TimelineEvent {
  const event = [...iterationEvents(iteration.iteration_id)].reverse().find(item => effectiveType(item) === "verified");
  if (!event) throw new Error(`Seal requires a verified event for ${iteration.iteration_id}.`);
  return event;
}

export function commitIteration(iterationId: string, message: string): string {
  if (!message.trim()) throw new Error("--message is required.");
  const iteration = loadGovernedIteration(iterationId);
  ensureNoForbiddenContentPaths(iteration);
  const errors = [...lifecycleErrors(iteration), ...scopeErrors(iteration, "content"), ...validateImmutability(), ...validateTimeline()];
  if (errors.length) throw new Error(errors.join("\n"));
  const verified = verifiedEvent(iteration);
  const values = trailerValues(iteration, verified.event_hash);
  const existing = gitText(["log", "-n", "30", "--format=%H%x09%B"], true);
  if (existing.includes(`Iteration-ID: ${iteration.iteration_id}`)) throw new Error(`${iteration.iteration_id} already has a content commit.`);
  const paths = iteration.content_paths.filter(relative => fs.existsSync(resolveProjectPath(relative)) || gitText(["ls-files", "--error-unmatch", relative], true));
  git(["add", "--", ...paths]);
  const staged = gitText(["diff", "--cached", "--name-only"], true).split("\n").filter(Boolean);
  if (!staged.length) throw new Error("Content scope has no staged changes; refusing empty governed commit.");
  const outside = staged.filter(candidate => !iteration.content_paths.some(item => pathMatches(candidate, item)));
  if (outside.length) throw new Error(`Staged path is outside content scope: ${outside.join(", ")}.`);
  ensureNoForbiddenContentPaths({ ...iteration, content_paths: staged });
  git(["commit", "--message", message, "--message", trailerBlock(values)]);
  const commit = gitText(["rev-parse", "HEAD"]);
  const trailerErrors = verifyRequiredTrailers(commit, iteration, verified.event_hash);
  if (trailerErrors.length) throw new Error(trailerErrors.join("\n"));
  return commit;
}

function isAncestorOfHead(commit: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", commit, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export function findContentCommit(iteration: GovernedIteration, verified: TimelineEvent): string {
  const commits = gitText(["log", "--all", "--format=%H"], true).split("\n").filter(Boolean);
  const candidates = commits.filter(commit => commitTrailers(commit)["Iteration-ID"] === iteration.iteration_id);
  const exact = candidates.filter(commit =>
    isAncestorOfHead(commit)
    && verifyRequiredTrailers(commit, iteration, verified.event_hash).length === 0
    && scopeHash(iteration.state_hash_paths, commit) === iteration.after_state_sha256
  );
  if (exact.length === 0) throw new Error(`No reachable content commit with exact governed metadata was found for ${iteration.iteration_id}.`);
  if (exact.length > 1) throw new Error(`Multiple reachable content commits with exact governed metadata were found for ${iteration.iteration_id}: ${exact.join(", ")}.`);
  return exact[0];
}

function googleReceipt(iteration: GovernedIteration): { path: string; hash: string | null } | null {
  const receiptPath = iteration.seal_paths.find(candidate => candidate.startsWith("docs-platform/changelog/google-sync/") && fs.existsSync(resolveProjectPath(candidate)));
  if (!receiptPath) return null;
  const receipt = YAML.parse(fs.readFileSync(resolveProjectPath(receiptPath), "utf8"));
  return { path: receiptPath, hash: receipt.remote_readback_sha256 ?? receipt.readback_hash ?? null };
}

function existingGovernanceSourceRefs(iteration: GovernedIteration): string[] {
  const iterationRef = `docs-platform/changes/iterations/${iteration.iteration_id}.yaml`;
  const proposalRef = `docs-platform/changes/proposals/${iteration.proposal_id}.yaml`;
  const decisionRef = `docs-platform/changes/decisions/${iteration.decision_id}.yaml`;
  const registryDecisionRef = "docs-platform/registry/decisions.yaml";
  const exactChangeRef = `docs-platform/changes/${iteration.change_set_id}.yaml`;
  const changesDirectory = path.join(platformRoot, "changes");
  const matchingChange = fs.readdirSync(changesDirectory)
    .find(candidate => candidate === `${iteration.change_set_id}.yaml` || candidate.startsWith(`${iteration.change_set_id}-`) && candidate.endsWith(".yaml"));
  const changeRef = matchingChange ? `docs-platform/changes/${matchingChange}` : exactChangeRef;
  return [
    iterationRef,
    proposalRef,
    fs.existsSync(resolveProjectPath(decisionRef)) ? decisionRef : registryDecisionRef,
    changeRef,
  ].filter(candidate => fs.existsSync(resolveProjectPath(candidate)));
}

function currentTagMessage(iteration: GovernedIteration, contentCommit: string, timelineHeadHash: string): string {
  const google = googleReceipt(iteration);
  const link: GitLink = {
    iteration_id: iteration.iteration_id,
    decision_id: iteration.decision_id,
    change_set_id: iteration.change_set_id,
    verification_receipt: `docs-platform/changelog/verification/${iteration.iteration_id}.yaml`,
    approved_payload_hash: iteration.approved_payload_sha256,
    before_hash: iteration.before_state_sha256,
    after_hash: iteration.after_state_sha256,
    probable_git_commit: contentCommit,
    commit_message: gitText(["show", "-s", "--format=%s", contentCommit]),
    google_sync_receipt: google?.path ?? null,
    deployment_receipt: null,
    rollback_payload: iteration.rollback_payload,
    tag: `iteration/${iteration.iteration_id}`,
    confidence: "exact",
    legacy_without_trailers: false,
  };
  return annotatedTagMessage(link, timelineHeadHash);
}

function ensureIterationTag(iteration: GovernedIteration, contentCommit: string, eventHash: string): string {
  const tag = `iteration/${iteration.iteration_id}`;
  const target = gitText(["rev-parse", `${tag}^{commit}`], true);
  if (target && target !== contentCommit) throw new Error(`${tag} exists on ${target}; refusing force overwrite.`);
  if (!target) git(["tag", "--annotate", tag, contentCommit, "--message", currentTagMessage(iteration, contentCommit, eventHash)]);
  const objectType = gitText(["cat-file", "-t", `refs/tags/${tag}`], true);
  if (objectType !== "tag") throw new Error(`${tag} is not annotated.`);
  return tag;
}

function appendCommitted(iteration: GovernedIteration, contentCommit: string): GovernanceEventV2 {
  const existing = iterationEvents(iteration.iteration_id).find(event => effectiveType(event) === "committed");
  if (existing) {
    if (!isV2(existing)) throw new Error(`${iteration.iteration_id}: committed event is not Governance v2.`);
    if (existing.git.content_commit_hash !== contentCommit) throw new Error(`${iteration.iteration_id}: existing committed event points to another commit.`);
    return existing;
  }
  const verified = verifiedEvent(iteration);
  const all = readTimelineEvents();
  const lastRecorded = all.at(-1) ? (isV2(all.at(-1)!) ? (all.at(-1)! as GovernanceEventV2).recorded_at : (all.at(-1)! as any).timestamp) : "1970-01-01T00:00:00.000Z";
  const now = Date.now();
  const recordedAt = new Date(Math.max(now, Date.parse(lastRecorded) + 1)).toISOString();
  const occurredAt = new Date(gitText(["show", "-s", "--format=%cI", contentCommit])).toISOString();
  const verification = `docs-platform/changelog/verification/${iteration.iteration_id}.yaml`;
  const artifact = `docs-platform/changelog/artifacts/${iteration.iteration_id}.yaml`;
  const google = googleReceipt(iteration);
  return appendGovernanceEvent({
    event_id: `EVT-${iteration.iteration_id}-COMMITTED`,
    event_type: "committed",
    occurred_at: occurredAt,
    recorded_at: recordedAt,
    iteration_id: iteration.iteration_id,
    proposal_id: iteration.proposal_id,
    decision_id: iteration.decision_id,
    change_set_id: iteration.change_set_id,
    actor: "Codex",
    tool: "iteration:seal",
    scope: iteration.scope,
    summary: `${iteration.title}: content commit verified and linked to the governed lifecycle before sealing.`,
    approved_payload_sha256: iteration.approved_payload_sha256,
    before_hash: iteration.before_state_sha256,
    after_hash: iteration.after_state_sha256,
    affected_document_ids: iteration.affected_document_ids,
    affected_section_ids: iteration.affected_section_ids,
    source_refs: [
      ...existingGovernanceSourceRefs(iteration),
      iteration.approved_payload_path,
      verification,
      ...(google ? [google.path] : []),
      `commit:${contentCommit}`,
    ],
    git: {
      content_commit_hash: contentCommit,
      seal_commit_ref: `commit-subject:chore(governance): seal ${iteration.iteration_id}`,
      iteration_tag: `iteration/${iteration.iteration_id}`,
      commit_message_verified: true,
      trailers_verified: true,
    },
    external: { google_sync_receipts: google ? [google.path] : [], deployment_receipt: null, remote_readback_hash: google?.hash ?? null, production_url: null },
    rollback: {
      rollback_payload: iteration.rollback_payload,
      compensates_iteration_id: null,
      restores_hash: iteration.before_state_sha256,
      dependency_check: "Latest rollback remains suffix-only; historical reversal requires compensation.",
    },
    artifacts: { manifest_refs: fs.existsSync(resolveProjectPath(artifact)) ? [artifact] : [] },
    confidence: "exact",
  });
}

export function governanceValidationErrors(): string[] {
  return [...new Set([
    ...validateImmutability(),
    ...validateTimeline(),
    ...validateArtifacts(),
    ...validateExternalReceipts(),
    ...validateSnapshots(),
    ...verifyHistoricalTags(),
    ...contextValidationErrors(),
  ])];
}

export function sealIteration(iterationId: string): { content_commit_hash: string; seal_commit_hash: string; iteration_tag: string } {
  const iteration = loadGovernedIteration(iterationId);
  ensureNoForbiddenContentPaths(iteration);
  const sealSubject = `chore(governance): seal ${iterationId}`;
  const existingSeal = gitText(["log", "--all", "--format=%H%x09%s"], true)
    .split("\n")
    .find(line => line.slice(line.indexOf("\t") + 1) === sealSubject);
  if (existingSeal) throw new Error(`${iterationId} is already sealed.`);
  const verified = verifiedEvent(iteration);
  const contentCommit = findContentCommit(iteration, verified);
  const phaseErrors = [...scopeErrors(iteration, "seal"), ...lifecycleErrors(iteration), ...validateImmutability(), ...validateTimeline()];
  if (phaseErrors.length) throw new Error(phaseErrors.join("\n"));
  const committed = appendCommitted(iteration, contentCommit);
  const tag = ensureIterationTag(iteration, contentCommit, committed.event_hash);
  createIterationSnapshot({
    snapshot_id: `SNAPSHOT-${iteration.iteration_id}`,
    reason: "governed_iteration_seal",
    iteration_tag: tag,
    content_commit_hash: contentCommit,
    open_questions: ["Archive pending visual review artifacts in durable storage."],
  });
  buildContext();
  if (iteration.seal_paths.some(relative => resolveProjectPath(relative) === CAPEX_GOVERNANCE_PROJECTION_PATH)) writeCapexGovernanceProjection();
  const errors = governanceValidationErrors();
  if (errors.length) throw new Error(errors.join("\n"));
  const sealCandidates = iteration.seal_paths.filter(relative => fs.existsSync(resolveProjectPath(relative)) || gitText(["ls-files", "--error-unmatch", relative], true));
  for (const candidate of sealCandidates) {
    if (!candidate.startsWith("docs-platform/changelog/") && !candidate.startsWith("docs-platform/context/") && !candidate.startsWith("docs-platform/generated/")) {
      throw new Error(`Seal path is outside governance projections: ${candidate}.`);
    }
  }
  git(["add", "--", ...sealCandidates]);
  const staged = gitText(["diff", "--cached", "--name-only"], true).split("\n").filter(Boolean);
  if (!staged.length) throw new Error("Seal has no generated changes to commit.");
  const outside = staged.filter(candidate => !iteration.seal_paths.some(item => pathMatches(candidate, item)));
  if (outside.length) throw new Error(`Seal staged unexpected paths: ${outside.join(", ")}.`);
  git(["commit", "--message", `chore(governance): seal ${iteration.iteration_id}`]);
  const sealCommit = gitText(["rev-parse", "HEAD"]);
  return { content_commit_hash: contentCommit, seal_commit_hash: sealCommit, iteration_tag: tag };
}

export function finalizeIteration(iterationId: string, message: string) {
  const contentCommit = commitIteration(iterationId, message);
  const result = sealIteration(iterationId);
  if (result.content_commit_hash !== contentCommit) throw new Error("Finalize content commit changed unexpectedly before seal.");
  return result;
}
