import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { appendGovernanceEvent, effectiveType, isV2, readTimelineEvents, type GovernanceEventInputV2 } from "./timeline.js";
import { fileSha256, readYaml, resolveProjectPath } from "./util.js";

export type DriftResult = {
  system: "google" | "deployment";
  status: "match" | "drift" | "not_configured" | "live_readback_unavailable" | "local_source_changed";
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

export function deploymentDriftCheck(remoteBuildHashes: Record<string, string> = {}, appendEvents = true): DriftResult[] {
  const directory = path.join(platformRoot, "changelog", "deployments");
  const files = receiptFiles(directory);
  if (!files.length) return [{ system: "deployment", status: "not_configured", receipt: null, iteration_id: null, expected_hash: null, actual_hash: null, diff: null, action: "Create a deployment receipt during the next governed deployment." }];
  return files.map(file => {
    const value = readYaml<any>(file);
    const relative = receiptRelative(file);
    const expected = value.build_hash as string;
    const actual = remoteBuildHashes[value.deployment_id];
    if (!actual) return { system: "deployment", status: "live_readback_unavailable", receipt: relative, iteration_id: value.iteration_id, expected_hash: expected, actual_hash: null, diff: null, action: "No deployment performed; provide a read-only production build hash." };
    if (actual === expected) return { system: "deployment", status: "match", receipt: relative, iteration_id: value.iteration_id, expected_hash: expected, actual_hash: actual, diff: null, action: "None." };
    if (appendEvents) appendDriftOnce({ system: "deployment", iterationId: value.iteration_id, receipt: relative, expected, actual, productionUrl: value.production_url });
    return { system: "deployment", status: "drift", receipt: relative, iteration_id: value.iteration_id, expected_hash: expected, actual_hash: actual, diff: `build_hash: ${expected} -> ${actual}`, action: "Review restore preview or a new governed deployment; no automatic overwrite." };
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
    for (const field of ["iteration_id", "content_commit_hash", "build_hash", "deployment_id", "production_url", "deployed_at", "smoke_test_result"]) {
      if (value[field] === undefined || value[field] === null) errors.push(`${receiptRelative(file)}: missing ${field}.`);
    }
  }
  return errors;
}

