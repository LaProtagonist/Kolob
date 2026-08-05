import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { EVENTS_PATH } from "./timeline.js";
import { fileSha256, resolveProjectPath, sha256 } from "./util.js";

type Baseline = {
  schema_version: 2;
  events_prefixes: Array<{ name: string; bytes: number; sha256: string }>;
  immutable_receipts: Array<{ path: string; sha256: string }>;
};

export const IMMUTABILITY_BASELINE_PATH = path.join(platformRoot, "changelog", "immutability-baseline.yaml");

export function readImmutabilityBaseline(): Baseline {
  return YAML.parse(fs.readFileSync(IMMUTABILITY_BASELINE_PATH, "utf8")) as Baseline;
}

export function validateImmutability(): string[] {
  const errors: string[] = [];
  const baseline = readImmutabilityBaseline();
  const events = fs.readFileSync(EVENTS_PATH);
  for (const prefix of baseline.events_prefixes) {
    if (events.length < prefix.bytes) errors.push(`events.ndjson is shorter than protected prefix ${prefix.name} (${prefix.bytes} bytes).`);
    else {
      const actual = sha256(events.subarray(0, prefix.bytes));
      if (actual !== prefix.sha256) errors.push(`events.ndjson protected prefix ${prefix.name} changed: expected ${prefix.sha256}, got ${actual}.`);
    }
  }
  for (const receipt of baseline.immutable_receipts) {
    const file = resolveProjectPath(receipt.path);
    if (!fs.existsSync(file)) errors.push(`immutable receipt missing: ${receipt.path}.`);
    else {
      const actual = fileSha256(file);
      if (actual !== receipt.sha256) errors.push(`immutable receipt changed: ${receipt.path}; expected ${receipt.sha256}, got ${actual}.`);
    }
  }
  return errors;
}

