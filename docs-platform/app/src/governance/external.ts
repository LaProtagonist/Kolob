import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { buildContentStateManifest } from "../capex/content-state.js";
import { appendGovernanceEvent, effectiveType, isV2, readTimelineEvents, type GovernanceEventInputV2 } from "./timeline.js";
import { fileSha256, gitText, readYaml, resolveProjectPath } from "./util.js";

export type DriftResult = {
  system: "google" | "deployment";
  status: "match" | "drift" | "governance_only_drift" | "not_configured" | "live_readback_unavailable" | "local_source_changed";
  drift_kind?: "content" | "governance_only" | null;
  receipt: string | null;
  iteration_id: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  diff: string | null;
  action: string;
};

function blankDriftEvent(input: Partial<GovernanceEventInputV2> & Pick<GovernanceEventInputV2, "event_id" | "occurred_at" | "recorded_at" | "iteration_id" | "summary">): GovernanceEventInputV2 {
  return {
    event_type: "external_drift_detected",
    proposal_id: null,
    decision_id: null,
    change_set_id: null,
    actor: "Codex drift checker",
    tool: "google:drift:check",
    scope: "Read-only external comparison; no automatic overwrite.",
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
    ...input,
  };
}

function receiptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith(".yaml")).sort().map(name => path.join(directory, name));
}

function receiptRelative(file: string): string {
  return path.relative(path.resolve(platformRoot, ".."), file).replaceAll(path.sep, "/");
}

function appendDriftOnce(input: {
  system: "google" | "deployment";
  iterationId: string;
  receipt: string;
  expected: string;
  actual: string;
  productionUrl?: string | null;
}): void {
  const fingerprint = `${input.expected.slice(0, 12)}-${input.actual.slice(0, 12)}`;
  const eventId = `EVT-${input.iterationId}-${input.system.toUpperCase()}-DRIFT-${fingerprint}`;
  if (readTimelineEvents().some(event => event.event_id === eventId)) return;
  const timestamp = new Date().toISOString();
  const latest = [...readTimelineEvents()].reverse().find(event => event.iteration_id === input.iterationId);
  appendGovernanceEvent(blankDriftEvent({
    event_id: eventId,
    occurred_at: timestamp,
    recorded_at: timestamp,
    iteration_id: input.iterationId,
    proposal_id: latest?.proposal_id ?? null,
    decision_id: latest?.decision_id ?? null,
    change_set_id: latest?.change_set_id ?? null,
    approved_payload_sha256: latest ? (isV2(latest) ? latest.approved_payload_sha256 : latest.approved_payload.sha256) : null,
    before_hash: input.expected,
    after_hash: input.actual,
    summary: `${input.system} external readback differs from its recorded hash; no overwrite was performed.`,
    source_refs: [input.receipt],
    external: {
      google_sync_receipts: input.system === "google" ? [input.receipt] : [],
      deployment_receipt: input.system === "deployment" ? input.receipt : null,
      remote_readback_hash: input.actual,
      production_url: input.productionUrl ?? null,
    },
    rollback: {
      rollback_payload: null,
      compensates_iteration_id: null,
      restores_hash: input.expected,
      dependency_check: "Import preview or restore preview required before any external write.",
    },
  }));
}

export function googleDriftCheck(remoteReadbacks: Record<string, string> = {}, appendEvents = true): DriftResult[] {
  const directory = path.join(platformRoot, "changelog", "google-sync");
  const results: DriftResult[] = [];
  for (const file of receiptFiles(directory)) {
    const value = readYaml<any>(file);
    const relative = receiptRelative(file);
    const iteration = value.iteration_id ?? null;
    const localPath = value.local_path;
    const recordedLocalHash = value.local_source_sha256 ?? value.local_sha256 ?? null;
    if (localPath && recordedLocalHash && fs.existsSync(resolveProjectPath(localPath))) {
      const currentLocalHash = fileSha256(resolveProjectPath(localPath));
      if (currentLocalHash !== recordedLocalHash) {
        results.push({
          system: "google", status: "local_source_changed", receipt: relative, iteration_id: iteration,
          expected_hash: recordedLocalHash, actual_hash: currentLocalHash,
          diff: `local ${localPath}: ${recordedLocalHash} -> ${currentLocalHash}`,
          action: "No remote write. Govern an import/restore preview or create a new sync receipt.",
        });
        continue;
      }
    }
    const expectedRemote = value.remote_readback_sha256 ?? value.readback_hash ?? null;
    const actualRemote = remoteReadbacks[value.google_file_id];
    if (!expectedRemote || !actualRemote) {
      results.push({
        system: "google", status: "live_readback_unavailable", receipt: relative, iteration_id: iteration,
        expected_hash: expectedRemote, actual_hash: actualRemote ?? null, diff: null,
        action: "No overwrite. Supply an authenticated read-only remote hash to compare; use import preview or restore preview on drift.",
      });
      continue;
    }
    if (expectedRemote === actualRemote) {
      results.push({ system: "google", status: "match", receipt: relative, iteration_id: iteration, expected_hash: expectedRemote, actual_hash: actualRemote, diff: null, action: "None." });
    } else {
      const diff = `remote_readback_sha256: ${expectedRemote} -> ${actualRemote}`;
      results.push({ system: "google", status: "drift", receipt: relative, iteration_id: iteration, expected_hash: expectedRemote, actual_hash: actualRemote, diff, action: "Review import preview or restore preview; no automatic overwrite." });
      if (appendEvents && iteration) appendDriftOnce({ system: "google", iterationId: iteration, receipt: relative, expected: expectedRemote, actual: actualRemote });
    }
  }
  return results;
}

export type RemoteDeploymentState = string | { content_state_sha256: string; dist_sha256: string; seal_commit_hash?: string; repository_head_at_build?: string };

export function governanceOnlyRepositoryPath(relativePath: string): boolean {
  return [
    "docs-platform/changelog/",
    "docs-platform/context/",
    "docs-platform/changes/",
    "docs-platform/generated/capex-governance-projection.json",
    "docs-platform/registry/decisions.yaml",
    "docs-platform/registry/dependencies.yaml",
  ].some(prefix => relativePath === prefix.replace(/\/$/, "") || relativePath.startsWith(prefix));
}

export function classifyDeploymentDrift(input: {
  receiptContentState: string;
  receiptDistSha256: string;
  receiptSealCommit: string;
  currentContentState: string;
  repositoryHead: string | null;
  repositoryChangedPaths?: string[];
  remote: RemoteDeploymentState | null;
}): { status: "match" | "drift" | "governance_only_drift" | "live_readback_unavailable"; drift_kind: "content" | "governance_only" | null; actual_dist_sha256: string | null; diff: string | null; action: string } {
  if (input.currentContentState !== input.receiptContentState) {
    return {
      status: "drift", drift_kind: "content", actual_dist_sha256: null,
      diff: `content_state_sha256: ${input.receiptContentState} -> ${input.currentContentState}`,
      action: "Regenerate the content snapshot, build and deploy through a new governed iteration.",
    };
  }
  if (!input.remote) return { status: "live_readback_unavailable", drift_kind: null, actual_dist_sha256: null, diff: null, action: "No deployment performed; provide the read-only production deployment manifest." };
  const actualDist = typeof input.remote === "string" ? input.remote : input.remote.dist_sha256;
  const actualContent = typeof input.remote === "string" ? input.receiptContentState : input.remote.content_state_sha256;
  if (actualContent !== input.receiptContentState || actualDist !== input.receiptDistSha256) {
    return {
      status: "drift", drift_kind: "content", actual_dist_sha256: actualDist,
      diff: `production content/dist: ${input.receiptContentState}/${input.receiptDistSha256} -> ${actualContent}/${actualDist}`,
      action: "Review the production manifest and perform a governed deployment or rollback; no automatic overwrite.",
    };
  }
  if (input.repositoryHead && input.repositoryHead !== input.receiptSealCommit) {
    const contentPaths = (input.repositoryChangedPaths ?? []).filter(relativePath => !governanceOnlyRepositoryPath(relativePath));
    if (contentPaths.length) {
      return {
        status: "drift", drift_kind: "content", actual_dist_sha256: actualDist,
        diff: `repository content paths changed after deployed seal: ${contentPaths.join(", ")}`,
        action: "Build and deploy the changed public/source content through a new governed iteration.",
      };
    }
    return {
      status: "governance_only_drift", drift_kind: "governance_only", actual_dist_sha256: actualDist,
      diff: `repository HEAD ${input.repositoryHead} is newer than deployed seal ${input.receiptSealCommit} while content_state_sha256 is identical.`,
      action: "No deployment required. Repository HEAD is newer due to governance-only commits; public content state is identical.",
    };
  }
  return { status: "match", drift_kind: null, actual_dist_sha256: actualDist, diff: null, action: "None." };
}

export function deploymentDriftCheck(remoteBuildHashes: Record<string, RemoteDeploymentState> = {}, appendEvents = true): DriftResult[] {
  const directory = path.join(platformRoot, "changelog", "deployments");
  const files = receiptFiles(directory);
  if (!files.length) return [{ system: "deployment", status: "not_configured", receipt: null, iteration_id: null, expected_hash: null, actual_hash: null, diff: null, action: "Create a deployment receipt during the next governed deployment." }];
  const currentContentState = buildContentStateManifest().content_state_sha256;
  const repositoryHead = gitText(["rev-parse", "HEAD"], true) || null;
  return files.map(file => {
    const value = readYaml<any>(file);
    const relative = receiptRelative(file);
    const expectedDist = (value.dist_sha256 ?? value.build_hash) as string;
    const expectedContent = value.content_state_sha256 as string;
    const remote = remoteBuildHashes[value.deployment_id] ?? null;
    const classification = classifyDeploymentDrift({
      receiptContentState: expectedContent,
      receiptDistSha256: expectedDist,
      receiptSealCommit: value.seal_commit_hash,
      currentContentState,
      repositoryHead,
      repositoryChangedPaths: repositoryHead && value.seal_commit_hash
        ? gitText(["diff", "--name-only", `${value.seal_commit_hash}..${repositoryHead}`], true).split("\n").filter(Boolean)
        : [],
      remote,
    });
    if (classification.status === "drift" && currentContentState !== expectedContent) {
      const diff = classification.diff!;
      if (appendEvents) appendDriftOnce({ system: "deployment", iterationId: value.iteration_id, receipt: relative, expected: expectedContent, actual: currentContentState, productionUrl: value.production_url });
      return { system: "deployment", status: "drift", drift_kind: "content", receipt: relative, iteration_id: value.iteration_id, expected_hash: expectedContent, actual_hash: currentContentState, diff, action: classification.action };
    }
    if (classification.status === "live_readback_unavailable") return { system: "deployment", status: classification.status, drift_kind: classification.drift_kind, receipt: relative, iteration_id: value.iteration_id, expected_hash: expectedDist, actual_hash: null, diff: null, action: classification.action };
    if (classification.status === "drift") {
      const expected = expectedDist;
      const actual = classification.actual_dist_sha256 ?? "0".repeat(64);
      const diff = classification.diff!;
      if (appendEvents && /^[0-9a-f]{64}$/.test(actual)) appendDriftOnce({ system: "deployment", iterationId: value.iteration_id, receipt: relative, expected, actual, productionUrl: value.production_url });
      return { system: "deployment", status: "drift", drift_kind: "content", receipt: relative, iteration_id: value.iteration_id, expected_hash: expected, actual_hash: classification.actual_dist_sha256, diff, action: classification.action };
    }
    if (classification.status === "governance_only_drift") {
      return {
        system: "deployment", status: "governance_only_drift", drift_kind: "governance_only", receipt: relative, iteration_id: value.iteration_id,
        expected_hash: expectedDist, actual_hash: classification.actual_dist_sha256, diff: classification.diff,
        action: classification.action,
      };
    }
    return { system: "deployment", status: "match", drift_kind: null, receipt: relative, iteration_id: value.iteration_id, expected_hash: expectedDist, actual_hash: classification.actual_dist_sha256, diff: null, action: classification.action };
  });
}

export function validateExternalReceipts(): string[] {
  const errors: string[] = [];
  for (const file of receiptFiles(path.join(platformRoot, "changelog", "google-sync"))) {
    const value = readYaml<any>(file);
    if (value.receipt_version === 2) {
      for (const field of ["iteration_id", "content_commit_hash", "local_source_sha256", "google_file_id", "google_mime_type", "remote_readback_sha256", "synced_at", "result"]) {
        if (value[field] === undefined || value[field] === null) errors.push(`${receiptRelative(file)}: missing ${field}.`);
      }
    }
  }
  for (const file of receiptFiles(path.join(platformRoot, "changelog", "deployments"))) {
    const value = readYaml<any>(file);
    for (const field of ["iteration_id", "content_state_sha256", "content_commit_hash", "seal_commit_hash", "repository_head_at_build", "dist_sha256", "deployment_id", "production_url", "built_at", "deployed_at", "smoke_test_result"]) {
      if (value[field] === undefined || value[field] === null) errors.push(`${receiptRelative(file)}: missing ${field}.`);
    }
  }
  return errors;
}
