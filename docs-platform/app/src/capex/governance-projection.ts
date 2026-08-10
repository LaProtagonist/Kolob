import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { effectiveCommit, effectiveTag, effectiveType, isV2, readTimelineEvents } from "../governance/timeline.js";
import { atomicWrite, gitText, relativeToProject } from "../governance/util.js";
import { buildContentStateManifest } from "./content-state.js";

export const CAPEX_GOVERNANCE_PROJECTION_PATH = path.join(platformRoot, "generated", "capex-governance-projection.json");

function deploymentReceipts(): Array<Record<string, unknown>> {
  const directory = path.join(platformRoot, "changelog", "deployments");
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith(".yaml")).sort().map(name => {
    const value = YAML.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    return {
      path: `docs-platform/changelog/deployments/${name}`,
      deployment_id: value.deployment_id ?? null,
      content_state_sha256: value.content_state_sha256 ?? null,
      content_commit_hash: value.content_commit_hash ?? null,
      seal_commit_hash: value.seal_commit_hash ?? null,
      dist_sha256: value.dist_sha256 ?? value.build_hash ?? null,
      production_url: value.production_url ?? null,
      deployed_at: value.deployed_at ?? null,
      result: value.smoke_test_result ?? null,
    };
  });
}

function sealCommit(iterationId: string): string | null {
  return gitText(["log", "-1", "--format=%H", "--fixed-strings", "--grep", `chore(governance): seal ${iterationId}`], true) || null;
}

export function buildCapexGovernanceProjection() {
  const events = readTimelineEvents();
  const head = events.at(-1)!;
  const committed = [...events].reverse().find(event => effectiveType(event) === "committed" && effectiveCommit(event)) ?? null;
  const latestDeployment = [...events].reverse().find(event => effectiveType(event) === "deployed") ?? null;
  return {
    schema_version: 1,
    generated_from_event_id: head?.event_id ?? null,
    generated_from_event_hash: head?.event_hash ?? null,
    content_state_sha256: buildContentStateManifest().content_state_sha256,
    latest_committed_iteration: committed ? {
      iteration_id: committed.iteration_id,
      decision_id: committed.decision_id,
      change_set_id: committed.change_set_id,
      content_commit_hash: effectiveCommit(committed),
      seal_commit_hash: sealCommit(committed.iteration_id),
      iteration_tag: effectiveTag(committed),
    } : null,
    latest_deployment_event: latestDeployment ? {
      event_id: latestDeployment.event_id,
      iteration_id: latestDeployment.iteration_id,
      deployment_receipt: isV2(latestDeployment) ? latestDeployment.external.deployment_receipt : null,
      production_url: isV2(latestDeployment) ? latestDeployment.external.production_url : null,
    } : null,
    repository_head: gitText(["rev-parse", "HEAD"], true) || null,
    timeline_head: head ? { event_id: head.event_id, event_hash: head.event_hash } : null,
    deployment_receipts: deploymentReceipts(),
  };
}

export function writeCapexGovernanceProjection() {
  const value = buildCapexGovernanceProjection();
  atomicWrite(CAPEX_GOVERNANCE_PROJECTION_PATH, `${JSON.stringify(value, null, 2)}\n`);
  return { path: relativeToProject(CAPEX_GOVERNANCE_PROJECTION_PATH), ...value };
}

export function capexGovernanceProjectionIsCurrent(): boolean {
  if (!fs.existsSync(CAPEX_GOVERNANCE_PROJECTION_PATH)) return true;
  try {
    const stored = JSON.parse(fs.readFileSync(CAPEX_GOVERNANCE_PROJECTION_PATH, "utf8"));
    const head = readTimelineEvents().at(-1);
    return stored.generated_from_event_hash === (head?.event_hash ?? null);
  } catch {
    return false;
  }
}
