import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { readTimelineEvents } from "./timeline.js";
import { blobAt, canonical, gitText, projectRoot, sha256, writeYaml } from "./util.js";

export const SNAPSHOTS_DIR = path.join(platformRoot, "changelog", "snapshots");

type SnapshotManifest = {
  schema_version: 2;
  snapshot_id: string;
  reason: string;
  created_at: string;
  timeline_event_id: string;
  timeline_event_hash: string;
  iteration_tag: string | null;
  content_commit_hash: string;
  registry_hash: string;
  canonical_document_hashes: Array<{ document_id: string; local_path: string; sha256: string }>;
  google_readback_hashes: Array<{ receipt: string; sha256: string }>;
  deployment_url: string | null;
  open_questions: string[];
};

function hashTreeFiles(commit: string, prefix: string): string {
  const names = gitText(["ls-tree", "-r", "--name-only", commit, "--", prefix], true).split("\n").filter(Boolean).sort();
  const entries = names.map(name => ({ path: name, sha256: sha256(blobAt(commit, name)!) }));
  return sha256(canonical(entries));
}

function documentHash(commit: string, documentId: string, localPath: string): SnapshotManifest["canonical_document_hashes"][number] {
  const bytes = blobAt(commit, localPath);
  if (!bytes) throw new Error(`${commit}:${localPath} is missing.`);
  return { document_id: documentId, local_path: localPath, sha256: sha256(bytes) };
}

function readback(receipt: string): { receipt: string; sha256: string } | null {
  const absolute = path.join(projectRoot, receipt);
  if (!fs.existsSync(absolute)) return null;
  const value = YAML.parse(fs.readFileSync(absolute, "utf8"));
  const hash = value.remote_readback_sha256 ?? value.readback_hash;
  return typeof hash === "string" ? { receipt, sha256: hash } : null;
}

function eventEvidence(eventId: string): { id: string; hash: string } {
  const event = readTimelineEvents().find(item => item.event_id === eventId);
  if (!event) throw new Error(`Snapshot evidence event ${eventId} is missing.`);
  return { id: event.event_id, hash: event.event_hash };
}

function writeSnapshot(manifest: SnapshotManifest): string {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const file = path.join(SNAPSHOTS_DIR, `${manifest.snapshot_id}.yaml`);
  if (fs.existsSync(file)) {
    const current = YAML.parse(fs.readFileSync(file, "utf8"));
    if (canonical(current) !== canonical(manifest)) throw new Error(`Snapshot ${manifest.snapshot_id} already exists with different content.`);
    return file;
  }
  writeYaml(file, manifest);
  return file;
}

export function createRequiredHistoricalSnapshots(): string[] {
  const definitions = [
    {
      snapshot_id: "SNAPSHOT-FOUNDATION-V1-2026-07-23",
      reason: "after_foundation",
      commit: "6da1821cad295d7cee2dfabd7837eb9438be91b7",
      event: "EVT-LEGACY-CHG-004-IMPORTED",
      tag: null,
      documents: [["DOC-FOUNDATION", "docs-platform/00-foundation.md"]],
      receipts: ["docs-platform/changelog/google-sync/2026-08-01-DOC-FOUNDATION.yaml"],
    },
    {
      snapshot_id: "SNAPSHOT-BUSINESS-MODEL-ARCHITECTURE-V1-2026-08-01",
      reason: "after_business_model_architecture",
      commit: "827261bcd48ed1274a5a67eab6bf15c565133dc8",
      event: "EVT-LEGACY-CHG-006-IMPORTED",
      tag: null,
      documents: [
        ["DOC-FOUNDATION", "docs-platform/00-foundation.md"],
        ["DOC-BUSINESS-MODEL-ARCHITECTURE", "docs-platform/01-business-model-architecture.md"],
      ],
      receipts: ["docs-platform/changelog/google-sync/2026-08-01-DOC-BUSINESS-MODEL-ARCHITECTURE.yaml"],
    },
    {
      snapshot_id: "SNAPSHOT-CAPEX-REGISTER-V0-1-2026-08-01",
      reason: "after_major_capex_version",
      commit: "c228f8b69bbeed67b647f678d05ffe84daf15cf0",
      event: "EVT-ITR-CAPEX-REGISTER-2026-08-01-01-COMMITTED-BACKFILL",
      tag: "iteration/ITR-CAPEX-REGISTER-2026-08-01-01",
      documents: [
        ["DOC-CAPEX-EQUIPMENT-SPECIFICATION", "docs-platform/working/capex-equipment-specification.md"],
        ["DOC-CAPEX-EQUIPMENT-REGISTER", "docs-platform/working/capex-equipment-register.yaml"],
      ],
      receipts: ["docs-platform/changelog/google-sync/2026-08-01-DOC-CAPEX-EQUIPMENT-REGISTER.yaml"],
    },
  ] as const;

  return definitions.map(definition => {
    const evidence = eventEvidence(definition.event);
    const google = definition.receipts.map(readback).filter(Boolean) as SnapshotManifest["google_readback_hashes"];
    return writeSnapshot({
      schema_version: 2,
      snapshot_id: definition.snapshot_id,
      reason: definition.reason,
      created_at: new Date(gitText(["show", "-s", "--format=%aI", definition.commit])).toISOString(),
      timeline_event_id: evidence.id,
      timeline_event_hash: evidence.hash,
      iteration_tag: definition.tag,
      content_commit_hash: definition.commit,
      registry_hash: hashTreeFiles(definition.commit, "docs-platform/registry"),
      canonical_document_hashes: definition.documents.map(([id, local]) => documentHash(definition.commit, id, local)),
      google_readback_hashes: google,
      deployment_url: null,
      open_questions: ["Historical snapshot is metadata-only; later dependent changes remain authoritative."],
    });
  });
}

export function createIterationSnapshot(input: {
  snapshot_id: string;
  reason: string;
  iteration_tag: string;
  content_commit_hash: string;
  open_questions: string[];
}): string {
  const events = readTimelineEvents();
  const head = events.at(-1);
  if (!head) throw new Error("Cannot snapshot an empty timeline.");
  const registryDocument = YAML.parse(String(blobAt(input.content_commit_hash, "docs-platform/registry/documents.yaml")));
  const documents = (registryDocument?.documents ?? []).filter((item: any) => item.local_path && blobAt(input.content_commit_hash, item.local_path));
  const manifests = fs.existsSync(path.join(platformRoot, "changelog", "google-sync"))
    ? fs.readdirSync(path.join(platformRoot, "changelog", "google-sync")).filter(name => name.endsWith(".yaml"))
    : [];
  return writeSnapshot({
    schema_version: 2,
    snapshot_id: input.snapshot_id,
    reason: input.reason,
    created_at: "recorded_at" in head ? head.recorded_at : head.timestamp,
    timeline_event_id: head.event_id,
    timeline_event_hash: head.event_hash,
    iteration_tag: input.iteration_tag,
    content_commit_hash: input.content_commit_hash,
    registry_hash: hashTreeFiles(input.content_commit_hash, "docs-platform/registry"),
    canonical_document_hashes: documents.map((item: any) => documentHash(input.content_commit_hash, item.id, item.local_path)),
    google_readback_hashes: manifests.map(name => readback(`docs-platform/changelog/google-sync/${name}`)).filter(Boolean) as SnapshotManifest["google_readback_hashes"],
    deployment_url: null,
    open_questions: input.open_questions,
  });
}

export function validateSnapshots(): string[] {
  const errors: string[] = [];
  for (const file of fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter(name => name.endsWith(".yaml")) : []) {
    const manifest = YAML.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, file), "utf8")) as SnapshotManifest;
    if (manifest.schema_version !== 2) errors.push(`${file}: unsupported schema.`);
    const event = readTimelineEvents().find(item => item.event_id === manifest.timeline_event_id);
    if (!event || event.event_hash !== manifest.timeline_event_hash) errors.push(`${file}: timeline evidence mismatch.`);
    const commit = gitText(["rev-parse", `${manifest.content_commit_hash}^{commit}`], true);
    if (commit !== manifest.content_commit_hash) errors.push(`${file}: content commit missing.`);
    if (manifest.iteration_tag) {
      const target = gitText(["rev-parse", `${manifest.iteration_tag}^{commit}`], true);
      if (target !== manifest.content_commit_hash) errors.push(`${file}: iteration tag target mismatch.`);
    }
  }
  return errors;
}

