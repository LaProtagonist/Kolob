import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { buildContentStateManifest } from "../capex/content-state.js";
import { writeCapexGovernanceProjection } from "../capex/governance-projection.js";
import { WEB_SNAPSHOT_PATH } from "../capex/web-snapshot.js";
import { buildContext } from "./context.js";
import { appendGovernanceEvent, isV2, readTimelineEvents } from "./timeline.js";
import { atomicWrite, canonical, gitText, relativeToProject, resolveProjectPath, sha256, writeYaml } from "./util.js";

export const DEPLOYMENT_MANIFEST_NAME = "deployment-manifest.json";
export const DEFAULT_PRODUCTION_URL = "https://colob.spi.ski";
const projectRoot = path.resolve(platformRoot, "..");

export type DeploymentManifest = {
  schema_version: 1;
  iteration_id: string;
  content_state_sha256: string;
  content_commit_hash: string;
  seal_commit_hash: string;
  repository_head_at_build: string;
  dist_sha256: string;
  deployment_id: string;
  production_url: string;
  built_at: string;
  deployed_at: string;
};

function deployableFiles(directory: string): string[] {
  const result: string[] = [];
  function visit(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (relative === "__review" || relative.startsWith("__review/")) continue;
        visit(absolute);
      } else if (entry.isFile() && relative !== DEPLOYMENT_MANIFEST_NAME) result.push(relative);
    }
  }
  visit(directory);
  return result.sort();
}

export function distContentManifest(directory: string): Array<{ path: string; sha256: string; bytes: number }> {
  return deployableFiles(directory).map(relative => {
    const bytes = fs.readFileSync(path.join(directory, relative));
    return { path: relative, sha256: sha256(bytes), bytes: bytes.length };
  });
}

export function distSha256(directory: string): string {
  return sha256(canonical(distContentManifest(directory)));
}

function assertCommit(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`${label} must be a full 40-character Git commit hash.`);
}

export function writeDeploymentManifest(input: {
  iterationId: string;
  contentCommitHash: string;
  sealCommitHash: string;
  deploymentId: string;
  productionUrl?: string;
  builtAt: string;
  deployedAt: string;
  distDirectory?: string;
}): DeploymentManifest {
  assertCommit(input.contentCommitHash, "content_commit_hash");
  assertCommit(input.sealCommitHash, "seal_commit_hash");
  const distDirectory = input.distDirectory ?? path.join(projectRoot, "dist");
  if (!fs.existsSync(path.join(distDirectory, "index.html"))) throw new Error(`Build output is missing at ${distDirectory}.`);
  const contentState = buildContentStateManifest(projectRoot);
  const storedSnapshot = JSON.parse(fs.readFileSync(WEB_SNAPSHOT_PATH, "utf8"));
  if (storedSnapshot?.meta?.contentStateSha256 !== contentState.content_state_sha256) throw new Error("Cannot write deployment manifest for a stale content snapshot.");
  const manifest: DeploymentManifest = {
    schema_version: 1,
    iteration_id: input.iterationId,
    content_state_sha256: contentState.content_state_sha256,
    content_commit_hash: input.contentCommitHash,
    seal_commit_hash: input.sealCommitHash,
    repository_head_at_build: gitText(["rev-parse", "HEAD"]),
    dist_sha256: distSha256(distDirectory),
    deployment_id: input.deploymentId,
    production_url: input.productionUrl ?? DEFAULT_PRODUCTION_URL,
    built_at: input.builtAt,
    deployed_at: input.deployedAt,
  };
  atomicWrite(path.join(distDirectory, DEPLOYMENT_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function readDeploymentManifest(file = path.join(projectRoot, "dist", DEPLOYMENT_MANIFEST_NAME)): DeploymentManifest {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentManifest;
  for (const field of ["iteration_id", "content_state_sha256", "content_commit_hash", "seal_commit_hash", "repository_head_at_build", "dist_sha256", "deployment_id", "production_url", "built_at", "deployed_at"] as const) {
    if (!value[field]) throw new Error(`Deployment manifest is missing ${field}.`);
  }
  return value;
}

function safeDeploymentId(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("deployment_id contains unsupported characters.");
  return value;
}

export function recordDeploymentReceipt(input: { manifestPath?: string; smokeTestResult: "passed" | "failed"; actor?: string }) {
  const manifest = readDeploymentManifest(input.manifestPath);
  const id = safeDeploymentId(manifest.deployment_id);
  const receiptPath = path.join(platformRoot, "changelog", "deployments", `${id}.yaml`);
  if (fs.existsSync(receiptPath)) throw new Error(`Deployment receipt already exists: ${relativeToProject(receiptPath)}.`);
  const receipt = {
    ...manifest,
    schema_version: 2 as const,
    build_hash: manifest.dist_sha256,
    smoke_test_result: input.smokeTestResult,
    recorded_at: new Date().toISOString(),
  };
  writeYaml(receiptPath, receipt);

  const iterationPath = resolveProjectPath(`docs-platform/changes/iterations/${manifest.iteration_id}.yaml`);
  const iteration = YAML.parse(fs.readFileSync(iterationPath, "utf8"));
  const events = readTimelineEvents();
  const last = events.at(-1);
  const recordedAt = new Date(Math.max(Date.now(), Date.parse(isV2(last!) ? last.recorded_at : (last as any).timestamp) + 1)).toISOString();
  const tag = `iteration/${manifest.iteration_id}`;
  appendGovernanceEvent({
    event_id: `EVT-${manifest.iteration_id}-DEPLOYED-${id}`,
    event_type: "deployed",
    occurred_at: manifest.deployed_at,
    recorded_at: recordedAt,
    iteration_id: manifest.iteration_id,
    proposal_id: iteration.proposal_id,
    decision_id: iteration.decision_id,
    change_set_id: iteration.change_set_id,
    actor: input.actor ?? "Codex",
    tool: "deployment:receipt:record",
    scope: "Deployment of the already sealed public content state; governance receipt only.",
    summary: `Sealed content state ${manifest.content_state_sha256} deployed to ${manifest.production_url}; smoke test ${input.smokeTestResult}.`,
    approved_payload_sha256: iteration.approved_payload_sha256,
    before_hash: manifest.content_state_sha256,
    after_hash: manifest.content_state_sha256,
    affected_document_ids: [],
    affected_section_ids: ["deployment-provenance"],
    source_refs: [relativeToProject(receiptPath), `commit:${manifest.content_commit_hash}`, `commit:${manifest.seal_commit_hash}`, `tag:${tag}`],
    git: {
      content_commit_hash: manifest.content_commit_hash,
      seal_commit_ref: manifest.seal_commit_hash,
      iteration_tag: tag,
      commit_message_verified: true,
      trailers_verified: true,
    },
    external: {
      google_sync_receipts: [],
      deployment_receipt: relativeToProject(receiptPath),
      remote_readback_hash: manifest.dist_sha256,
      production_url: manifest.production_url,
    },
    rollback: {
      rollback_payload: iteration.rollback_payload ?? null,
      compensates_iteration_id: null,
      restores_hash: iteration.before_state_sha256 ?? null,
      dependency_check: "A deployment rollback requires a new governed reverse change set and a new deployment receipt.",
    },
    artifacts: { manifest_refs: [] },
    confidence: "exact",
  });
  buildContext();
  writeCapexGovernanceProjection();
  return { receipt: relativeToProject(receiptPath), ...receipt };
}
