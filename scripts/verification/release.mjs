import path from "node:path";
import { checksForDomain } from "./domains.mjs";
import { executeCheck, executePlan } from "./runner.mjs";
import { loadState, reusableReceipt } from "./cache.mjs";
import { computeDomainFingerprint } from "./hash.mjs";
import { cacheRoot, isMain, parseCli, readConfig, shortHash, writeJson } from "./utils.mjs";

export function planRelease(config, state = loadState()) {
  const domains = [];
  for (const [domainId, domain] of Object.entries(config.domains)) {
    if (!domain.releaseRequired) continue;
    const checks = checksForDomain(domain, "targeted", "direct");
    const fingerprint = computeDomainFingerprint({ config, domainId, level: "targeted", profile: "direct", checks, visualImpact: "none" });
    domains.push({ domain: domainId, checks, fingerprint, status: reusableReceipt(state, fingerprint) ? "REUSED" : "RUN" });
  }
  return { domains, gates: config.release.alwaysRun.map(id => ({ id, definition: config.checks[id] })) };
}

export async function executeRelease({ config = readConfig(), state = loadState(), dryRun = false, sealed = false } = {}) {
  const started = Date.now();
  const releasePlan = planRelease(config, state);
  const stale = releasePlan.domains.filter(item => item.status === "RUN").map(item => ({
    domain: item.domain,
    profile: "direct",
    level: "targeted",
    checks: item.checks,
    visualImpact: "none",
    visual: false,
  }));
  const domainReport = await executePlan({
    config,
    plan: stale,
    affected: { directDomains: stale.map(item => item.domain), affectedDomains: releasePlan.domains.map(item => item.domain), visualImpact: {} },
    state,
    dryRun,
  });
  const gates = [];
  if (domainReport.result === "PASS") {
    for (const gate of releasePlan.gates) {
      if (gate.definition.sealedOnly && !sealed) {
        gates.push({ id: gate.id, result: "NOT_APPLICABLE" });
        continue;
      }
      if (dryRun) {
        gates.push({ id: gate.id, result: "PENDING" });
        continue;
      }
      const result = await executeCheck(gate.id, gate.definition, { logPrefix: "release" });
      gates.push(result);
      if (result.result === "FAIL") break;
    }
  }
  const result = domainReport.result === "PASS" && gates.every(gate => ["PASS", "PENDING", "NOT_APPLICABLE"].includes(gate.result)) ? "PASS" : "FAIL";
  return { releasePlan, domainReport, gates, result, durationMs: Date.now() - started, dryRun };
}

function printRelease(report) {
  process.stdout.write("RELEASE VERIFICATION\n\nDOMAIN STATUS\n");
  const byDomain = new Map(report.releasePlan.domains.map(item => [item.domain, item]));
  for (const item of report.releasePlan.domains) {
    const ran = report.domainReport.run.some(result => result.domain === item.domain);
    const failed = report.domainReport.failures.some(result => result.domain === item.domain);
    const status = item.status === "REUSED" ? "REUSED PASS" : report.dryRun ? "RUN    PENDING" : failed ? "RUN    FAIL" : ran ? "RUN    PASS" : "RUN    SKIPPED";
    process.stdout.write(`  ${item.domain.padEnd(22)} ${status.padEnd(14)} ${shortHash(byDomain.get(item.domain).fingerprint.inputHash)}\n`);
  }
  process.stdout.write("\nRELEASE GATES\n");
  for (const gate of report.gates) process.stdout.write(`  ${gate.id.padEnd(28)} ${gate.result}\n`);
  process.stdout.write(`\nRESULT\n  ${report.dryRun ? "RELEASE PLAN" : report.result === "PASS" ? "RELEASE READY" : "RELEASE BLOCKED"}\n  ${(report.durationMs / 1000).toFixed(1)}s\n`);
}

if (isMain(import.meta.url)) {
  const { flags } = parseCli(process.argv.slice(2));
  try {
    const report = await executeRelease({ dryRun: flags.has("dry-run") || flags.has("plan"), sealed: flags.has("sealed") });
    writeJson(path.join(cacheRoot, "last-release.json"), report);
    printRelease(report);
    if (!report.dryRun && report.result === "FAIL") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
