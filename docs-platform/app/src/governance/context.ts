import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { loadRegistry, registryKinds, validateRegistry } from "./registry.js";
import {
  effectiveChangeSetId,
  effectiveCommit,
  effectiveDecisionId,
  effectiveTag,
  effectiveType,
  generateTimeline,
  isV2,
  readTimelineEvents,
  renderTimeline,
  TIMELINE_PATH,
  validateTimeline,
  type GovernanceEventV2,
  type TimelineEvent,
} from "./timeline.js";
import { verifyHistoricalTags } from "./history.js";
import { atomicWrite, canonical, fileSha256, gitText, projectRoot, relativeToProject, resolveProjectPath, sha256, writeYaml } from "./util.js";

export const PROJECT_STATE_PATH = path.join(platformRoot, "context", "PROJECT_STATE.yaml");
export const HANDOFF_PATH = path.join(platformRoot, "context", "CODEX_HANDOFF.md");

export type ProjectState = {
  schema_version: 2;
  generated_at: string;
  project: string;
  branch: string;
  latest_timeline_event_id: string;
  latest_timeline_event_hash: string;
  latest_closed_iteration_id: string | null;
  latest_iteration_tag: string | null;
  latest_content_commit_hash: string | null;
  registry_hash: string;
  canonical_document_hashes: Array<{ document_id: string; local_path: string; sha256: string; status: string }>;
  open_decisions: string[];
  open_change_sets: string[];
  open_questions: string[];
  current_workstream: string;
  next_task: string;
  google_integration_status: Record<string, unknown>;
  mcp_status: Record<string, unknown>;
  deployment_status: Record<string, unknown>;
  known_drift: string[];
  artifact_status: Record<string, unknown>;
};

function registryFiles(): string[] {
  return registryKinds.map(kind => path.join(platformRoot, "registry", `${kind}.yaml`));
}

export function registryProjectionHash(): string {
  return sha256(canonical(registryFiles().map(file => ({ path: relativeToProject(file), sha256: fileSha256(file) }))));
}

export function canonicalDocumentHashes(): ProjectState["canonical_document_hashes"] {
  const registry = loadRegistry();
  return registry.documents
    .filter(document => typeof document.local_path === "string" && document.local_path.length > 0)
    .map(document => {
      const file = resolveProjectPath(document.local_path);
      return {
        document_id: document.id as string,
        local_path: document.local_path as string,
        sha256: fs.existsSync(file) ? fileSha256(file) : "missing",
        status: document.status as string,
      };
    })
    .sort((left, right) => left.document_id.localeCompare(right.document_id));
}

function yamlFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter(item => item.endsWith(".yaml"))
    .map(item => path.join(directory, item));
}

function openChangeSets(): string[] {
  const ids: string[] = [];
  for (const file of yamlFiles(path.join(platformRoot, "changes"))) {
    try {
      const value = YAML.parse(fs.readFileSync(file, "utf8"));
      if (value?.status === "proposed" && value?.change_id) ids.push(value.change_id);
    } catch { /* malformed legacy evidence is reported separately */ }
  }
  return [...new Set(ids)].sort();
}

function artifactProjection(): Record<string, unknown> {
  const directory = path.join(platformRoot, "changelog", "artifacts");
  const manifests = yamlFiles(directory).map(file => {
    try { return YAML.parse(fs.readFileSync(file, "utf8")); }
    catch { return null; }
  }).filter(Boolean);
  const artifacts = manifests.flatMap(manifest => manifest.artifacts ?? []);
  return {
    manifests: manifests.length,
    artifacts: artifacts.length,
    pending_archive: artifacts.filter(artifact => artifact.status === "pending_archive").length,
    durable: artifacts.filter(artifact => artifact.status === "archived" && artifact.remote_url).length,
  };
}

function googleProjection(): Record<string, unknown> {
  const directory = path.join(platformRoot, "changelog", "google-sync");
  const receipts = yamlFiles(directory);
  const withRemoteHash = receipts.filter(file => {
    try {
      const value = YAML.parse(fs.readFileSync(file, "utf8"));
      return Boolean(value.remote_readback_sha256 ?? value.readback_hash);
    } catch { return false; }
  });
  return {
    configured: fs.existsSync(path.join(platformRoot, "config", "google.json")),
    historical_receipts: receipts.length,
    receipts_with_machine_readback_hash: withRemoteHash.length,
    live_drift_check: "not_run_by_context_build",
  };
}

function deploymentProjection(): Record<string, unknown> {
  const directory = path.join(platformRoot, "changelog", "deployments");
  const receipts = yamlFiles(directory);
  return { status: receipts.length ? "receipts_present" : "not_configured", receipts: receipts.length, production_url: null };
}

function latestCommitted(events: TimelineEvent[]): TimelineEvent | undefined {
  return [...events].reverse().find(event => effectiveType(event) === "committed" && effectiveCommit(event));
}

function eventIterationTitle(iterationId: string | null): string {
  if (!iterationId) return "No active governed workstream";
  const file = path.join(platformRoot, "changes", "iterations", `${iterationId}.yaml`);
  if (!fs.existsSync(file)) return iterationId;
  try { return YAML.parse(fs.readFileSync(file, "utf8"))?.title ?? iterationId; }
  catch { return iterationId; }
}

function knownDrift(): string[] {
  const drift: string[] = [];
  for (const relative of [
    "docs-platform/changelog/audit/ITR-LAUNCH-COST-PRESENTATION-2026-08-05-01.yaml",
    "docs-platform/changelog/payloads/ITR-LAUNCH-COST-PRESENTATION-2026-08-05-01-approved.yaml",
  ]) {
    try { YAML.parse(fs.readFileSync(resolveProjectPath(relative), "utf8")); }
    catch { drift.push(`malformed_legacy_yaml:${relative}`); }
  }
  const artifacts = artifactProjection();
  if (Number(artifacts.pending_archive) > 0) drift.push("review_artifacts_pending_durable_archive");
  return drift;
}

export function buildProjectState(events = readTimelineEvents()): ProjectState {
  if (!events.length) throw new Error("Cannot build project state without timeline events.");
  const timelineErrors = validateTimeline(events);
  if (timelineErrors.length) throw new Error(timelineErrors.join("\n"));
  const registryErrors = validateRegistry();
  if (registryErrors.length) throw new Error(registryErrors.join("\n"));
  const head = events.at(-1)!;
  const committed = latestCommitted(events);
  const registry = loadRegistry();
  const openDecisions = registry.decisions.filter(decision => ["idea", "research", "proposed"].includes(decision.status)).map(decision => decision.id).sort();
  return {
    schema_version: 2,
    generated_at: isV2(head) ? head.recorded_at : head.timestamp,
    project: "Колобочная",
    branch: gitText(["branch", "--show-current"]),
    latest_timeline_event_id: head.event_id,
    latest_timeline_event_hash: head.event_hash,
    latest_closed_iteration_id: committed?.iteration_id ?? null,
    latest_iteration_tag: committed ? effectiveTag(committed) : null,
    latest_content_commit_hash: committed ? effectiveCommit(committed) : null,
    registry_hash: registryProjectionHash(),
    canonical_document_hashes: canonicalDocumentHashes(),
    open_decisions: openDecisions,
    open_change_sets: openChangeSets(),
    open_questions: [
      "Archive pending review artifacts in durable storage before treating visual verification as portable.",
      "Create deployment receipts when the next governed deployment is performed.",
      "Decide whether malformed superseded legacy YAML evidence should receive a separate correction event.",
    ],
    current_workstream: eventIterationTitle(committed?.iteration_id ?? head.iteration_id),
    next_task: "Select the next task through a new governed proposal; no business task is pre-authorized.",
    google_integration_status: googleProjection(),
    mcp_status: {
      implementation_present: fs.existsSync(path.join(platformRoot, "mcp", "src")),
      canonical_access: "registry_document_ids_only",
      live_status: "not_probed_by_context_build",
    },
    deployment_status: deploymentProjection(),
    known_drift: knownDrift(),
    artifact_status: artifactProjection(),
  };
}

function compactHash(hash: string | null): string {
  return hash ? `\`${hash}\`` : "—";
}

export function renderHandoff(state: ProjectState): string {
  const documents = state.canonical_document_hashes.map(item => `| ${item.document_id} | ${item.status} | \`${item.local_path}\` | \`${item.sha256}\` |`);
  return [
    "AUTO-GENERATED — DO NOT EDIT MANUALLY",
    "",
    "# Codex handoff — Колобочная",
    "",
    "## 1. Назначение проекта",
    "",
    "Проект ведёт локальные канонические инвестиционные документы и их governance-историю. Бизнес-содержание меняется только через отдельно утверждённые решения; этот handoff является машинной проекцией, а не источником истины.",
    "",
    "## 2. Текущая ветка и governed iteration",
    "",
    `- Branch: \`${state.branch}\`.`,
    `- Latest closed iteration: ${state.latest_closed_iteration_id ? `\`${state.latest_closed_iteration_id}\`` : "—"}.`,
    `- Latest iteration tag: ${state.latest_iteration_tag ? `\`${state.latest_iteration_tag}\`` : "—"}.`,
    `- Latest content commit: ${compactHash(state.latest_content_commit_hash)}.`,
    "- Текущий Git HEAD намеренно не записывается: его вычисляет `npm run project:onboard`.",
    "",
    "## 3. Timeline head",
    "",
    `- Event: \`${state.latest_timeline_event_id}\`.`,
    `- Hash: \`${state.latest_timeline_event_hash}\`.`,
    `- generated_from_event_hash: \`${state.latest_timeline_event_hash}\`.`,
    "",
    "## 4. Канонические документы",
    "",
    "| Document | Status | Local path | SHA-256 |",
    "|---|---|---|---|",
    ...documents,
    "",
    "## 5. Текущая рабочая тема",
    "",
    state.current_workstream,
    "",
    "## 6. Decisions и change sets",
    "",
    `- Open decisions: ${state.open_decisions.length ? state.open_decisions.map(value => `\`${value}\``).join(", ") : "none"}.`,
    `- Open change sets: ${state.open_change_sets.length ? state.open_change_sets.map(value => `\`${value}\``).join(", ") : "none"}.`,
    "",
    "## 7. Открытые вопросы",
    "",
    ...state.open_questions.map(question => `- ${question}`),
    "",
    "## 8. Google / MCP / deployment",
    "",
    `- Google: \`${JSON.stringify(state.google_integration_status)}\`.`,
    `- MCP: \`${JSON.stringify(state.mcp_status)}\`.`,
    `- Deployment: \`${JSON.stringify(state.deployment_status)}\`.`,
    "",
    "## 9. Команды проверки",
    "",
    "```bash",
    "npm run project:onboard",
    "npm run context:validate",
    "npm run timeline:validate",
    "npm run registry:validate",
    "npm test",
    "npx tsc --noEmit",
    "git diff --check",
    "```",
    "",
    "## 10. Следующая задача",
    "",
    state.next_task,
    "",
  ].join("\n");
}

export function buildContext(): ProjectState {
  const state = buildProjectState();
  writeYaml(PROJECT_STATE_PATH, state);
  atomicWrite(HANDOFF_PATH, renderHandoff(state));
  generateTimeline(TIMELINE_PATH);
  return state;
}

export function readProjectState(): ProjectState {
  if (!fs.existsSync(PROJECT_STATE_PATH)) throw new Error("PROJECT_STATE.yaml is missing; run context:build.");
  return YAML.parse(fs.readFileSync(PROJECT_STATE_PATH, "utf8")) as ProjectState;
}

export function commitTrailers(commit: string): Record<string, string> {
  const message = gitText(["show", "-s", "--format=%B", commit]);
  const result: Record<string, string> = {};
  for (const line of message.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]+):\s*(.+)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

export function expectedTrailers(event: TimelineEvent): Record<string, string> {
  const approved = isV2(event) ? event.approved_payload_sha256 : event.approved_payload.sha256;
  return {
    "Iteration-ID": event.iteration_id,
    "Decision-ID": effectiveDecisionId(event) ?? "null",
    "Change-Set-ID": effectiveChangeSetId(event) ?? "null",
    "Approved-Payload-SHA256": approved ?? "null",
    "Before-State-SHA256": event.before_hash ?? "null",
    "After-State-SHA256": event.after_hash ?? "null",
  };
}

export function validateCommitTrailers(event: TimelineEvent, timelineHeadHash?: string): string[] {
  const commit = effectiveCommit(event);
  if (!commit) return [`${event.iteration_id}: content commit is missing.`];
  const actual = commitTrailers(commit);
  const expected = expectedTrailers(event);
  if (timelineHeadHash) expected["Timeline-Head-SHA256"] = timelineHeadHash;
  const errors: string[] = [];
  for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) errors.push(`${event.iteration_id}: trailer ${key} expected ${value}, got ${actual[key] ?? "missing"}.`);
  if (!actual["Timeline-Head-SHA256"]) errors.push(`${event.iteration_id}: trailer Timeline-Head-SHA256 is missing.`);
  return errors;
}

export function projectionFreshnessErrors(saved: ProjectState, handoffText: string, timelineText: string, expected = buildProjectState()): string[] {
  const errors: string[] = [];
  if (canonical(saved) !== canonical(expected)) errors.push("PROJECT_STATE.yaml is stale or differs from the timeline/registry projection.");
  if (handoffText !== renderHandoff(saved)) errors.push("CODEX_HANDOFF.md is stale or was edited manually.");
  if (timelineText !== renderTimeline()) errors.push("TIMELINE.md is stale or was edited manually.");
  return errors;
}

export function contextValidationErrors(): string[] {
  const errors: string[] = [];
  let saved: ProjectState;
  try { saved = readProjectState(); }
  catch (error) { return [(error as Error).message]; }
  const expected = buildProjectState();
  if (!fs.existsSync(HANDOFF_PATH)) errors.push("CODEX_HANDOFF.md is missing.");
  if (!fs.existsSync(TIMELINE_PATH)) errors.push("TIMELINE.md is missing.");
  if (fs.existsSync(HANDOFF_PATH) && fs.existsSync(TIMELINE_PATH)) {
    errors.push(...projectionFreshnessErrors(saved, fs.readFileSync(HANDOFF_PATH, "utf8"), fs.readFileSync(TIMELINE_PATH, "utf8"), expected));
  } else if (canonical(saved) !== canonical(expected)) {
    errors.push("PROJECT_STATE.yaml is stale or differs from the timeline/registry projection.");
  }
  if (saved.registry_hash !== registryProjectionHash()) errors.push("PROJECT_STATE registry hash is stale.");
  const latest = latestCommitted(readTimelineEvents());
  if (latest && isV2(latest) && latest.git.trailers_verified === true) {
    const verified = [...readTimelineEvents()].reverse().find(event => event.iteration_id === latest.iteration_id && effectiveType(event) === "verified");
    errors.push(...validateCommitTrailers(latest, verified?.event_hash));
  }
  if (saved.latest_iteration_tag && saved.latest_content_commit_hash) {
    const target = gitText(["rev-parse", `${saved.latest_iteration_tag}^{commit}`], true);
    if (!target) errors.push(`Iteration tag ${saved.latest_iteration_tag} is missing.`);
    else if (target !== saved.latest_content_commit_hash) errors.push(`Iteration tag ${saved.latest_iteration_tag} points to ${target}, expected ${saved.latest_content_commit_hash}.`);
  }
  errors.push(...validateTimeline());
  errors.push(...validateRegistry());
  errors.push(...verifyHistoricalTags());
  return [...new Set(errors)];
}

export function validateContext(): void {
  const errors = contextValidationErrors();
  if (errors.length) throw new Error(errors.join("\n"));
}

function dirtyLines(): string[] {
  const value = gitText(["status", "--porcelain=v1", "--untracked-files=all"], true);
  return value ? value.split("\n") : [];
}

export function onboardReport(): { output: string; errors: string[] } {
  const errors = contextValidationErrors();
  const state = fs.existsSync(PROJECT_STATE_PATH) ? readProjectState() : null;
  const dirty = dirtyLines();
  const missingTags = verifyHistoricalTags().filter(error => /missing/.test(error));
  const output = [
    `root: ${projectRoot}`,
    `branch: ${gitText(["branch", "--show-current"])}`,
    `HEAD: ${gitText(["rev-parse", "HEAD"])}`,
    `dirty: ${dirty.length ? "yes" : "no"}`,
    ...dirty.map(line => `  ${line}`),
    `latest iteration: ${state?.latest_closed_iteration_id ?? "unknown"}`,
    `timeline head: ${state?.latest_timeline_event_id ?? "unknown"} ${state?.latest_timeline_event_hash ?? "unknown"}`,
    `registry status: ${state && state.registry_hash === registryProjectionHash() ? "current" : "stale"}`,
    `open tasks: ${state?.open_change_sets.join(", ") || "none"}`,
    `Google status: ${state ? JSON.stringify(state.google_integration_status) : "unknown"}`,
    `MCP status: ${state ? JSON.stringify(state.mcp_status) : "unknown"}`,
    `missing tags: ${missingTags.length ? missingTags.join("; ") : "none"}`,
    `Handoff stale: ${errors.some(error => /HANDOFF|PROJECT_STATE|TIMELINE/.test(error)) ? "yes" : "no"}`,
  ].join("\n");
  return { output, errors };
}
