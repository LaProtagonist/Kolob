import fs from "node:fs";
import path from "node:path";
import { cacheRoot, ensureCacheDirectories, isMain, projectRoot, readConfig, shortHash, writeJson } from "./utils.mjs";
import { fingerprintMatches } from "./hash.mjs";

const stateFile = path.join(cacheRoot, "state.json");

export function receiptKey(domain, level, profile = "direct") {
  return `${domain}:${level}:${profile}`;
}

export function loadState(filename = stateFile) {
  if (!fs.existsSync(filename)) return { version: 1, receipts: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
    return { version: parsed.version || 1, receipts: parsed.receipts || {} };
  } catch {
    return { version: 1, receipts: {} };
  }
}

export function saveState(state, filename = stateFile) {
  ensureCacheDirectories(path.dirname(filename));
  writeJson(filename, state);
}

export function reusableReceipt(state, fingerprint) {
  const receipt = state.receipts[receiptKey(fingerprint.domain, fingerprint.level, fingerprint.profile)];
  return fingerprintMatches(receipt, fingerprint) ? receipt : null;
}

export function recordReceipt(state, fingerprint, result) {
  const receipt = {
    ...fingerprint,
    result: result.result,
    timestamp: new Date().toISOString(),
    durationMs: result.durationMs,
    checks: result.checks || [],
    logPath: result.logPath || null,
    screenshotPaths: result.screenshotPaths || [],
  };
  state.receipts[receiptKey(fingerprint.domain, fingerprint.level, fingerprint.profile)] = receipt;
  return receipt;
}

export function invalidateCache(target = cacheRoot) {
  const resolved = path.resolve(target);
  const expected = path.resolve(projectRoot, ".cache", "verification");
  if (resolved !== expected) throw new Error(`Refusing to invalidate unexpected path: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
  return resolved;
}

export function compactState(state = loadState(), config = readConfig()) {
  return Object.keys(config.domains).map(domain => {
    const receipts = Object.values(state.receipts).filter(receipt => receipt.domain === domain && receipt.result === "PASS");
    const latest = receipts.sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
    return latest ? { domain, result: latest.result, level: latest.level, hash: shortHash(latest.inputHash), timestamp: latest.timestamp } : { domain, result: "MISSING" };
  });
}

if (isMain(import.meta.url)) {
  const command = process.argv[2];
  if (command !== "invalidate") throw new Error("Usage: node scripts/verification/cache.mjs invalidate");
  const removed = invalidateCache();
  process.stdout.write(`verification cache invalidated: ${path.relative(projectRoot, removed)}\n`);
}
