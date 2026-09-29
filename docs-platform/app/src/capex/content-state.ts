import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { canonical, sha256 } from "../governance/util.js";

export const CONTENT_STATE_SCHEMA_VERSION = 1;
export const CONTENT_SNAPSHOT_SCHEMA_VERSION = 2;

export const CONTENT_SOURCE_PATHS = [
  "docs-platform/working/capex-equipment-register.yaml",
  "docs-platform/working/capex-price-research.yaml",
  "docs-platform/working/capex-modules.yaml",
  "docs-platform/working/capex-module-items.yaml",
  "docs-platform/working/capex-point-formats.yaml",
  "docs-platform/working/capex-configurations.yaml",
  "docs-platform/working/capex-configuration-overrides.yaml",
  "docs-platform/working/pilot-capex-assumptions.yaml",
  "docs-platform/working/investor-start-model.yaml",
  "docs-platform/registry/documents.yaml",
  "docs-platform/app/src/capex/web-snapshot.ts",
  "docs-platform/app/src/capex/content-state.ts",
  "docs-platform/app/src/capex/register.ts",
  "docs-platform/app/src/capex/modular.ts",
  "docs-platform/app/src/capex/price-research.ts",
  "src/lib/capex-composition.ts",
  "docs-platform/schemas/capex-web-snapshot.schema.json",
] as const;

const PUBLIC_DOCUMENT_IDS = [
  "DOC-FOUNDATION",
  "DOC-BUSINESS-MODEL-ARCHITECTURE",
  "DOC-CAPEX-EQUIPMENT-SPECIFICATION",
  "DOC-CAPEX-EQUIPMENT-REGISTER",
  "DOC-CAPEX-PRICE-RESEARCH",
] as const;

export type ContentSourcePath = typeof CONTENT_SOURCE_PATHS[number];
export type ContentSourceOverrides = Partial<Record<ContentSourcePath, string | Buffer>>;

export type ContentSourceHash = {
  path: ContentSourcePath;
  sha256: string;
  normalization: "yaml_canonical_nfc" | "json_canonical_nfc" | "text_lf_nfc" | "public_document_projection";
};

export type ContentStateManifest = {
  schema_version: typeof CONTENT_STATE_SCHEMA_VERSION;
  snapshot_schema_version: typeof CONTENT_SNAPSHOT_SCHEMA_VERSION;
  source_files: ContentSourceHash[];
  content_state_sha256: string;
};

const defaultProjectRoot = path.resolve(platformRoot, "..");

function normalizeStrings(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.normalize("NFC"), normalizeStrings(item)]));
  }
  return value;
}

function normalizedText(value: string | Buffer): string {
  return value.toString("utf8").replace(/\r\n?/g, "\n").normalize("NFC");
}

function publicDocumentProjection(text: string): unknown {
  const documents = (YAML.parse(text)?.documents ?? []) as Array<Record<string, unknown>>;
  return PUBLIC_DOCUMENT_IDS.map(id => {
    const document = documents.find(item => item.id === id);
    if (!document) return { id, exists: false };
    return {
      id,
      exists: true,
      title: document.title ?? null,
      version: document.version ?? null,
      status: document.status ?? null,
      updated_at: document.updated_at ?? null,
      local_path: document.local_path ?? null,
      google_file_id: document.google_file_id ?? null,
    };
  });
}

function normalizedSource(relativePath: ContentSourcePath, bytes: string | Buffer): { text: string; normalization: ContentSourceHash["normalization"] } {
  const text = normalizedText(bytes);
  if (relativePath === "docs-platform/registry/documents.yaml") {
    return { text: canonical(normalizeStrings(publicDocumentProjection(text))), normalization: "public_document_projection" };
  }
  if (relativePath.endsWith(".yaml")) {
    return { text: canonical(normalizeStrings(YAML.parse(text))), normalization: "yaml_canonical_nfc" };
  }
  if (relativePath.endsWith(".json")) {
    return { text: canonical(normalizeStrings(JSON.parse(text))), normalization: "json_canonical_nfc" };
  }
  return { text, normalization: "text_lf_nfc" };
}

export function buildContentStateManifest(root = defaultProjectRoot, overrides: ContentSourceOverrides = {}): ContentStateManifest {
  const sourceFiles = CONTENT_SOURCE_PATHS.map(relativePath => {
    const bytes = overrides[relativePath] ?? fs.readFileSync(path.join(root, relativePath));
    const normalized = normalizedSource(relativePath, bytes);
    return { path: relativePath, sha256: sha256(normalized.text), normalization: normalized.normalization };
  });
  const fingerprintInput: Omit<ContentStateManifest, "content_state_sha256"> = {
    schema_version: CONTENT_STATE_SCHEMA_VERSION,
    snapshot_schema_version: CONTENT_SNAPSHOT_SCHEMA_VERSION,
    source_files: sourceFiles,
  };
  return { ...fingerprintInput, content_state_sha256: sha256(canonical(fingerprintInput)) };
}

export function sourceHashMap(manifest: ContentStateManifest): Record<ContentSourcePath, string> {
  return Object.fromEntries(manifest.source_files.map(source => [source.path, source.sha256])) as Record<ContentSourcePath, string>;
}

export function changedContentSources(expected: ContentStateManifest, actual: ContentStateManifest): Array<{ path: string; expected: string | null; actual: string | null }> {
  const expectedMap = new Map(expected.source_files.map(item => [item.path, item.sha256]));
  const actualMap = new Map(actual.source_files.map(item => [item.path, item.sha256]));
  return [...new Set([...expectedMap.keys(), ...actualMap.keys()])].sort().flatMap(relativePath => {
    const before = expectedMap.get(relativePath) ?? null;
    const after = actualMap.get(relativePath) ?? null;
    return before === after ? [] : [{ path: relativePath, expected: before, actual: after }];
  });
}
