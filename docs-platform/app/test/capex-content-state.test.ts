import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTENT_SOURCE_PATHS,
  buildContentStateManifest,
  changedContentSources,
  type ContentSourceOverrides,
} from "../src/capex/content-state.js";
import { secretShaped } from "../src/governance/util.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");

function changed(relativePath: typeof CONTENT_SOURCE_PATHS[number]) {
  const original = fs.readFileSync(path.join(project, relativePath), "utf8");
  const mutated = relativePath.endsWith(".yaml")
    ? `${original}\ncontent_state_test: true\n`
    : relativePath.endsWith(".json")
      ? `${JSON.stringify({ ...JSON.parse(original), content_state_test: true }, null, 2)}\n`
      : `${original}\n// content-state-test\n`;
  return buildContentStateManifest(project, { [relativePath]: mutated } as ContentSourceOverrides);
}

test("content fingerprint changes for page-affecting CAPEX and Investor sources", () => {
  const baseline = buildContentStateManifest(project);
  for (const relativePath of [
    "docs-platform/working/capex-equipment-register.yaml",
    "docs-platform/working/capex-price-research.yaml",
    "docs-platform/working/investor-start-model.yaml",
    "docs-platform/working/capex-module-items.yaml",
  ] as const) assert.notEqual(changed(relativePath).content_state_sha256, baseline.content_state_sha256, relativePath);
});

test("governance-only files, receipts and tags are excluded from content fingerprint", () => {
  const baseline = buildContentStateManifest(project);
  const governancePaths = [
    "docs-platform/changelog/events.ndjson",
    "docs-platform/changelog/TIMELINE.md",
    "docs-platform/context/CODEX_HANDOFF.md",
    "docs-platform/context/PROJECT_STATE.yaml",
    "docs-platform/changelog/verification/fixture.yaml",
    "docs-platform/changelog/deployments/fixture.yaml",
    "refs/tags/iteration/fixture",
  ];
  for (const relativePath of governancePaths) {
    const withIgnoredOverride = buildContentStateManifest(project, { [relativePath]: "governance-only-change" } as any);
    assert.equal(withIgnoredOverride.content_state_sha256, baseline.content_state_sha256, relativePath);
  }
  assert.equal(CONTENT_SOURCE_PATHS.some(item => /events|TIMELINE|HANDOFF|PROJECT_STATE|receipt|deployment/.test(item)), false);
});

test("content manifest is deterministic, ordered, path-relative and independent of absolute root", () => {
  const first = buildContentStateManifest(project);
  const second = buildContentStateManifest(project);
  assert.deepEqual(first, second);
  assert.deepEqual(first.source_files.map(item => item.path), [...CONTENT_SOURCE_PATHS]);
  assert.equal(first.source_files.every(item => !path.isAbsolute(item.path)), true);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-content-state-"));
  try {
    for (const relativePath of CONTENT_SOURCE_PATHS) {
      const destination = path.join(temporary, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(project, relativePath), destination);
    }
    assert.equal(buildContentStateManifest(temporary).content_state_sha256, first.content_state_sha256);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("line endings and Unicode normalization do not perturb the content hash", () => {
  const relativePath = "docs-platform/working/capex-modules.yaml" as const;
  const original = fs.readFileSync(path.join(project, relativePath), "utf8");
  const crlf = original.normalize("NFD").replace(/\n/g, "\r\n");
  assert.equal(
    buildContentStateManifest(project, { [relativePath]: crlf }).content_state_sha256,
    buildContentStateManifest(project).content_state_sha256,
  );
});

test("generator or snapshot schema changes make the content state stale", () => {
  const baseline = buildContentStateManifest(project);
  for (const relativePath of ["docs-platform/app/src/capex/web-snapshot.ts", "docs-platform/schemas/capex-web-snapshot.schema.json"] as const) {
    const next = changed(relativePath);
    assert.notEqual(next.content_state_sha256, baseline.content_state_sha256);
    assert.equal(changedContentSources(baseline, next).some(item => item.path === relativePath), true);
  }
});

test("content snapshot manifest contains source hashes and no secret-shaped data or Git HEAD dependency", () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(project, "src/content/capex-configurator-data.json"), "utf8"));
  assert.equal(snapshot.meta.contentState.source_files.length, CONTENT_SOURCE_PATHS.length);
  assert.equal(snapshot.meta.contentStateSha256, snapshot.meta.contentState.content_state_sha256);
  assert.equal(snapshot.meta.sourceBundleSha256, snapshot.meta.contentStateSha256);
  assert.equal(snapshot.meta.gitBaselineCommit, "не зафиксирован");
  assert.doesNotMatch(snapshot.meta.gitBaselineCommit, /^[0-9a-f]{40}$/);
  assert.equal(secretShaped(snapshot), false);
  const generator = fs.readFileSync(path.join(platform, "app/src/capex/web-snapshot.ts"), "utf8");
  assert.doesNotMatch(generator, /rev-parse|execFileSync|generated_at\s*:/);
});
