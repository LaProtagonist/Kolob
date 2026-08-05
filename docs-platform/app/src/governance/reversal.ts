import fs from "node:fs";
import path from "node:path";
import { platformRoot } from "../google/config.js";
import { readGitLinkIndex, type GitLink } from "./history.js";
import { blobAt, gitText, projectRoot, sha256, writeYaml } from "./util.js";

type Consequence = {
  path: string;
  before_sha256: string | null;
  iteration_after_sha256: string | null;
  current_sha256: string | null;
  state: "still_present" | "evolved" | "no_longer_present";
};

function changedFiles(commit: string): string[] {
  return gitText(["diff-tree", "--no-commit-id", "--name-only", "-r", commit], true).split("\n").filter(Boolean).sort();
}

function hash(bytes: Buffer | null): string | null {
  return bytes ? sha256(bytes) : null;
}

function exactIterations(): GitLink[] {
  return readGitLinkIndex().iterations.filter(item => item.confidence === "exact");
}

export function rollbackLatestPreview(steps: number) {
  if (!Number.isInteger(steps) || steps < 1) throw new Error("--steps must be a positive integer.");
  const iterations = exactIterations();
  if (steps > iterations.length) throw new Error(`Cannot rollback ${steps} steps; only ${iterations.length} sealed iterations are indexed.`);
  const selected = iterations.slice(-steps).reverse();
  return {
    schema_version: 2,
    mode: "rollback_latest",
    steps,
    current_head: gitText(["rev-parse", "HEAD"]),
    suffix_only: true,
    apply_permitted: false,
    approval_required: true,
    order: selected.map(item => ({
      iteration_id: item.iteration_id,
      content_commit_hash: item.probable_git_commit,
      rollback_payload: item.rollback_payload,
      expected_current_state: item.after_hash,
      restores_hash: item.before_hash,
    })),
    warning: "Prepare creates a new proposed reverse plan. It never runs git reset and never removes history.",
  };
}

export function prepareRollbackLatest(steps: number): string {
  const preview = rollbackLatestPreview(steps);
  const id = `ROLLBACK-LATEST-${preview.order[0].iteration_id}-STEPS-${steps}`;
  const output = path.join(platformRoot, "changes", "rollback", `${id}.yaml`);
  if (fs.existsSync(output)) throw new Error(`Rollback proposal already exists: ${path.relative(projectRoot, output)}.`);
  writeYaml(output, {
    ...preview,
    rollback_id: id,
    status: "proposed",
    requested_steps: steps,
    decision_id: null,
    approved: false,
  });
  return output;
}

function consequenceAtCurrent(link: GitLink): Consequence[] {
  const parent = `${link.probable_git_commit}^`;
  return changedFiles(link.probable_git_commit).map(file => {
    const before = hash(blobAt(parent, file));
    const after = hash(blobAt(link.probable_git_commit, file));
    const absolute = path.join(projectRoot, file);
    const current = fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null;
    return {
      path: file,
      before_sha256: before,
      iteration_after_sha256: after,
      current_sha256: current,
      state: current === after ? "still_present" : current === before ? "no_longer_present" : "evolved",
    };
  });
}

export function historicalCompensationPreview(iterationId: string) {
  const iterations = exactIterations();
  const index = iterations.findIndex(item => item.iteration_id === iterationId);
  if (index < 0) throw new Error(`Unknown exact iteration ${iterationId}; no compensation guess was made.`);
  const target = iterations[index];
  const consequences = consequenceAtCurrent(target);
  const targetPaths = new Set(consequences.map(item => item.path));
  const dependencies = iterations.slice(index + 1).map(link => {
    const overlap = changedFiles(link.probable_git_commit).filter(file => targetPaths.has(file));
    return overlap.length ? { iteration_id: link.iteration_id, content_commit_hash: link.probable_git_commit, overlapping_paths: overlap } : null;
  }).filter(Boolean);
  const proposedId = `CHG-COMPENSATE-${iterationId}`;
  return {
    schema_version: 2,
    mode: "historical_compensation",
    proposal: {
      change_id: proposedId,
      title: `Compensating change for ${iterationId}`,
      status: "proposed",
      compensates_iteration_id: iterationId,
      decision_id: null,
      separate_approved_decision_required: true,
      operations: consequences.filter(item => item.state !== "no_longer_present").map(item => ({
        type: "compensate_against_current_state",
        path: item.path,
        current_sha256: item.current_sha256,
        historical_before_sha256: item.before_sha256,
        historical_after_sha256: item.iteration_after_sha256,
      })),
    },
    current_state: { head: gitText(["rev-parse", "HEAD"]), consequences },
    later_dependencies: dependencies,
    conflicts: dependencies.length ? ["Later governed iterations overlap the historical file scope; compensation must preserve or explicitly replace their effects."] : [],
    applies_changes: false,
    terminology: "This is compensation, not rollback.",
  };
}
