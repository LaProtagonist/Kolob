import { checksForDomain } from "./domains.mjs";
import { loadState, reusableReceipt } from "./cache.mjs";
import { computeDomainFingerprint } from "./hash.mjs";
import { isMain, readConfig, shortHash } from "./utils.mjs";

export function currentStatus(config = readConfig(), state = loadState()) {
  return Object.entries(config.domains).map(([domainId, domain]) => {
    const checks = checksForDomain(domain, "targeted", "direct");
    const fingerprint = computeDomainFingerprint({ config, domainId, level: "targeted", profile: "direct", checks, visualImpact: "none" });
    const receipt = reusableReceipt(state, fingerprint);
    const historical = Object.values(state.receipts).some(item => item.domain === domainId && item.result === "PASS");
    return { domain: domainId, status: receipt ? "CURRENT PASS" : historical ? "STALE" : "MISSING", hash: shortHash(fingerprint.inputHash), timestamp: receipt?.timestamp || null };
  });
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write("VERIFICATION STATUS\n");
    for (const item of currentStatus()) process.stdout.write(`  ${item.domain.padEnd(22)} ${item.status.padEnd(12)} ${item.hash}${item.timestamp ? `  ${item.timestamp}` : ""}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
