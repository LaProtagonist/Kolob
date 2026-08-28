import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { fileSha256, resolveProjectPath, secretShaped } from "./util.js";

export const ARTIFACTS_DIR = path.join(platformRoot, "changelog", "artifacts");

export type ArtifactRecord = {
  artifact_id: string;
  iteration_id: string;
  type: string;
  filename: string;
  sha256: string;
  size: number;
  created_at: string;
  purpose: string;
  storage: string;
  remote_url: string | null;
  status: "pending_archive" | "archived" | "temporary" | "superseded";
};

export type ArtifactManifest = { schema_version: 2; iteration_id: string; artifacts: ArtifactRecord[] };

export function readArtifactManifests(): Array<{ file: string; manifest: ArtifactManifest }> {
  if (!fs.existsSync(ARTIFACTS_DIR)) return [];
  return fs.readdirSync(ARTIFACTS_DIR).filter(name => name.endsWith(".yaml")).sort().map(name => ({
    file: path.join(ARTIFACTS_DIR, name),
    manifest: YAML.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, name), "utf8")) as ArtifactManifest,
  }));
}

export function validateArtifacts(): string[] {
  const errors: string[] = [];
  const schema = JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", "artifact-manifest.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const ids = new Set<string>();
  for (const { file, manifest } of readArtifactManifests()) {
    if (!validate(manifest)) errors.push(...(validate.errors ?? []).map(error => `${path.basename(file)}${error.instancePath}: ${error.message}`));
    if (secretShaped(manifest)) errors.push(`${path.basename(file)}: secret-shaped field detected.`);
    for (const artifact of manifest.artifacts ?? []) {
      if (artifact.iteration_id !== manifest.iteration_id) errors.push(`${artifact.artifact_id}: iteration mismatch.`);
      if (ids.has(artifact.artifact_id)) errors.push(`${artifact.artifact_id}: duplicate artifact ID.`);
      ids.add(artifact.artifact_id);
      const absolute = resolveProjectPath(artifact.filename);
      if (fs.existsSync(absolute)) {
        if (fs.statSync(absolute).size !== artifact.size) errors.push(`${artifact.artifact_id}: size mismatch.`);
        if (fileSha256(absolute) !== artifact.sha256) errors.push(`${artifact.artifact_id}: SHA-256 mismatch.`);
      } else if (!artifact.remote_url && artifact.status !== "superseded") {
        errors.push(`${artifact.artifact_id}: neither local file nor durable remote URL is available.`);
      }
      if (!artifact.remote_url && artifact.status !== "pending_archive" && artifact.status !== "temporary" && artifact.status !== "superseded") {
        errors.push(`${artifact.artifact_id}: artifact without durable storage must be pending_archive, temporary or superseded.`);
      }
      if (/verification|visual|review/i.test(artifact.purpose) && !artifact.remote_url && artifact.status !== "pending_archive" && artifact.status !== "superseded") {
        errors.push(`${artifact.artifact_id}: verified evidence without durable storage must be pending_archive or superseded.`);
      }
    }
  }
  return errors;
}
