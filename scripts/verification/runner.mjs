import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { affectedFromWorkingTree, classifyAffected, getChangedFiles } from "./affected.mjs";
import { buildPlan, planExplicitDomain } from "./domains.mjs";
import { loadState, recordReceipt, reusableReceipt, saveState } from "./cache.mjs";
import { computeDomainFingerprint } from "./hash.mjs";
import { runVisualVerification } from "./visual.mjs";
import { cacheRoot, ensureCacheDirectories, isMain, parseCli, projectRoot, readConfig, shortHash, timestampSlug, writeJson } from "./utils.mjs";

const SITE_DOMAINS = new Set(["capex", "revenue-ui", "launch-budget", "economics-ui", "franchise-platform", "site-core"]);
const VISUAL_ALIASES = { economics: "economics-ui", revenue: "revenue-ui", launch: "launch-budget", capex: "capex", franchise: "franchise-platform", site: "site-core" };

export async function executeCheck(checkId, definition, { root = projectRoot, logPrefix = "verification" } = {}) {
  ensureCacheDirectories();
  const started = Date.now();
  const [command, ...args] = definition.command;
  const logPath = path.join(cacheRoot, "logs", `${timestampSlug()}-${logPrefix}-${checkId.replace(/[^a-z0-9_-]+/gi, "-")}.log`);
  return await new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: definition.cwd ? path.join(root, definition.cwd) : root,
      env: { ...process.env, ...(definition.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [`$ ${[command, ...args].join(" ")}\n`];
    child.stdout.on("data", chunk => chunks.push(chunk.toString()));
    child.stderr.on("data", chunk => chunks.push(chunk.toString()));
    child.on("error", error => chunks.push(`${error.stack || error.message}\n`));
    child.on("close", code => {
      fs.writeFileSync(logPath, chunks.join(""), "utf8");
      resolve({
        id: checkId,
        result: code === 0 ? "PASS" : "FAIL",
        code,
        durationMs: Date.now() - started,
        logPath: path.relative(root, logPath),
        detail: code === 0 ? null : chunks.join("").trim().split(/\r?\n/).slice(-8).join("\n"),
      });
    });
  });
}

function defaultReport(affected) {
  return {
    affectedDomains: affected.affectedDomains || [],
    directDomains: affected.directDomains || [],
    visualImpact: affected.visualImpact || {},
    run: [],
    reused: [],
    skipped: [],
    failures: [],
    durationMs: 0,
    result: "PASS",
  };
}

export async function executePlan({
  config,
  plan,
  affected,
  useCache = true,
  dryRun = false,
  root = projectRoot,
  state = loadState(),
  executeCheckFn = executeCheck,
  visualRunner = runVisualVerification,
  saveStateFn = saveState,
} = {}) {
  const started = Date.now();
  const report = defaultReport(affected);
  const allDomains = Object.keys(config.domains);
  report.skipped = allDomains.filter(domain => !plan.some(entry => entry.domain === domain));
  const executedChecks = new Map();
  const pending = [];

  for (const entry of plan) {
    const fingerprint = computeDomainFingerprint({ root, config, domainId: entry.domain, level: entry.level, profile: entry.profile, checks: entry.checks, visualImpact: entry.visualImpact });
    entry.fingerprint = fingerprint;
    const receipt = useCache ? reusableReceipt(state, fingerprint) : null;
    if (receipt) {
      report.reused.push({ domain: entry.domain, level: entry.level, profile: entry.profile, hash: fingerprint.inputHash, durationMs: receipt.durationMs });
      continue;
    }
    if (dryRun) {
      for (const checkId of entry.checks) report.run.push({ domain: entry.domain, id: checkId, result: "PENDING", hash: fingerprint.inputHash, durationMs: 0 });
      if (entry.visual) report.run.push({ domain: entry.domain, id: `visual:${entry.domain}:${entry.visualImpact}`, result: "PENDING", hash: fingerprint.inputHash, durationMs: 0 });
      continue;
    }

    const domainStarted = Date.now();
    const checkResults = [];
    for (const checkId of entry.checks) {
      let checkResult = executedChecks.get(checkId);
      if (!checkResult) {
        checkResult = await executeCheckFn(checkId, config.checks[checkId], { root, logPrefix: entry.domain });
        executedChecks.set(checkId, checkResult);
        report.run.push({ domain: entry.domain, ...checkResult });
      } else {
        checkResults.push({ ...checkResult, reusedInRun: true });
        continue;
      }
      checkResults.push(checkResult);
      if (checkResult.result === "FAIL") {
        const failure = { domain: entry.domain, check: checkId, logPath: checkResult.logPath, detail: checkResult.detail };
        report.failures.push(failure);
        report.result = "FAIL";
        recordReceipt(state, fingerprint, { result: "FAIL", durationMs: Date.now() - domainStarted, checks: checkResults, logPath: checkResult.logPath });
        saveStateFn(state);
        report.durationMs = Date.now() - started;
        report.skipped.push(...plan.slice(plan.indexOf(entry) + 1).map(item => item.domain).filter(domain => !report.skipped.includes(domain)));
        return report;
      }
    }
    if (entry.visual) {
      pending.push({ entry, fingerprint, domainStarted, checkResults });
    } else {
      recordReceipt(state, fingerprint, {
        result: "PASS",
        durationMs: Date.now() - domainStarted,
        checks: checkResults,
        logPath: checkResults.at(-1)?.logPath || null,
      });
      saveStateFn(state);
    }
  }

  if (!dryRun) {
    const visualPending = pending;
    let visualReport = { results: [], screenshotPaths: [] };
    if (visualPending.length) {
      try {
        visualReport = await visualRunner({
          config,
          root,
          selections: visualPending.map(item => ({ domain: item.entry.domain, impact: item.entry.visualImpact, hash: item.fingerprint.inputHash })),
        });
        for (const result of visualReport.results) {
          report.run.push({ domain: result.domain, id: `visual:${result.viewport}`, result: "PASS", durationMs: 0, screenshotPath: result.screenshotPath ? path.relative(root, result.screenshotPath) : null });
        }
      } catch (error) {
        const failedDomain = error.domain || visualPending[0].entry.domain;
        const failure = { domain: failedDomain, check: "visual", logPath: null, detail: error.message };
        report.failures.push(failure);
        report.result = "FAIL";
        const item = visualPending.find(candidate => candidate.entry.domain === failedDomain) || visualPending[0];
        recordReceipt(state, item.fingerprint, { result: "FAIL", durationMs: Date.now() - item.domainStarted, checks: item.checkResults });
        saveStateFn(state);
        report.durationMs = Date.now() - started;
        return report;
      }
    }

    for (const item of pending) {
      const screenshotPaths = visualReport.results
        .filter(result => result.domain === item.entry.domain && result.screenshotPath)
        .map(result => path.relative(root, result.screenshotPath));
      recordReceipt(state, item.fingerprint, {
        result: "PASS",
        durationMs: Date.now() - item.domainStarted,
        checks: item.checkResults,
        logPath: item.checkResults.at(-1)?.logPath || null,
        screenshotPaths,
      });
    }
    saveStateFn(state);
  }
  report.durationMs = Date.now() - started;
  return report;
}

function printReport(report, { base, dryRun = false } = {}) {
  process.stdout.write("AFFECTED DOMAINS\n");
  if (report.affectedDomains.length) for (const domain of report.affectedDomains) process.stdout.write(`  ${domain}\n`);
  else process.stdout.write("  none\n");
  if (base) process.stdout.write(`  base: ${base}\n`);
  const impacts = Object.entries(report.visualImpact).filter(([, impact]) => impact !== "none");
  if (impacts.length) {
    process.stdout.write("\nVISUAL IMPACT\n");
    for (const [domain, impact] of impacts) process.stdout.write(`  ${domain.padEnd(20)} ${impact}\n`);
  }
  process.stdout.write("\nRUN\n");
  if (!report.run.length) process.stdout.write("  none\n");
  for (const item of report.run) {
    const marker = item.result === "PASS" ? "✓" : item.result === "PENDING" ? "·" : "✗";
    process.stdout.write(`  ${marker} ${item.id.padEnd(26)} ${item.result}${item.durationMs ? `  ${(item.durationMs / 1000).toFixed(1)}s` : ""}\n`);
  }
  process.stdout.write("\nREUSED\n");
  if (!report.reused.length) process.stdout.write("  none\n");
  for (const item of report.reused) process.stdout.write(`  ${item.domain.padEnd(22)} PASS  ${shortHash(item.hash)}\n`);
  process.stdout.write("\nSKIPPED\n");
  process.stdout.write(report.skipped.length ? `  ${report.skipped.join(", ")}\n` : "  none\n");
  if (report.failures.length) {
    process.stdout.write("\nFAILURES\n");
    for (const failure of report.failures) {
      process.stdout.write(`  ${failure.domain}/${failure.check}: ${failure.detail?.split(/\r?\n/).at(-1) || "failed"}\n`);
      if (failure.logPath) process.stdout.write(`  log: ${failure.logPath}\n`);
    }
  }
  process.stdout.write(`\nTOTAL\n  ${dryRun ? "PLAN" : report.result}\n  ${(report.durationMs / 1000).toFixed(1)}s\n`);
}

function selectWork(mode, parsed, config) {
  const level = String(parsed.flags.get("level") || (mode === "fast" ? "fast" : "targeted"));
  const explicitFiles = parsed.flags.get("files") ? String(parsed.flags.get("files")).split(",") : undefined;
  if (mode === "domain") {
    const domainId = parsed.positional[1];
    const plan = planExplicitDomain(config, domainId, { level, includeDownstream: parsed.flags.has("include-downstream") });
    return { affected: { base: "explicit", files: [], directDomains: [domainId], affectedDomains: plan.map(entry => entry.domain), visualImpact: {} }, plan };
  }
  if (mode === "visual" && parsed.positional[1]) {
    const domainId = VISUAL_ALIASES[parsed.positional[1]] || parsed.positional[1];
    const plan = planExplicitDomain(config, domainId, { level: "targeted", visualImpact: "high" }).map(entry => ({ ...entry, profile: "visual", checks: [], visual: true, visualImpact: "high" }));
    return { affected: { base: "explicit", files: [], directDomains: [domainId], affectedDomains: [domainId], visualImpact: { [domainId]: "high" } }, plan };
  }
  const changes = getChangedFiles({ files: explicitFiles, base: parsed.flags.get("base") || undefined });
  const classified = classifyAffected(changes, config);
  let directDomains = classified.directDomains;
  let affectedDomains = classified.affectedDomains;
  if (mode === "site") {
    directDomains = directDomains.filter(domain => SITE_DOMAINS.has(domain));
    affectedDomains = affectedDomains.filter(domain => SITE_DOMAINS.has(domain));
  }
  if (mode === "visual") {
    directDomains = directDomains.filter(domain => config.domains[domain].visual?.route);
    affectedDomains = directDomains;
  }
  let plan = buildPlan({ config, directDomains, affectedDomains, visualImpact: classified.visualImpact, level, forceVisual: mode === "visual" });
  if (mode === "visual") plan = plan.map(entry => ({ ...entry, profile: "visual", checks: [], visual: true }));
  return { affected: { ...changes, ...classified, directDomains, affectedDomains }, plan };
}

export async function runCli(argv = process.argv.slice(2)) {
  const parsed = parseCli(argv);
  const mode = parsed.positional[0] || "affected";
  if (!["fast", "affected", "domain", "site", "visual"].includes(mode)) throw new Error(`Unknown verification mode: ${mode}`);
  const config = readConfig();
  const { affected, plan } = selectWork(mode, parsed, config);
  const dryRun = parsed.flags.has("dry-run") || parsed.flags.has("plan");
  const report = await executePlan({ config, plan, affected, useCache: !parsed.flags.has("no-cache"), dryRun });
  ensureCacheDirectories();
  writeJson(path.join(cacheRoot, "last-run.json"), report);
  printReport(report, { base: affected.base, dryRun });
  return report;
}

if (isMain(import.meta.url)) {
  try {
    const report = await runCli();
    if (report.result === "FAIL") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
