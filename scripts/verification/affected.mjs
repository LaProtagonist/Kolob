import fs from "node:fs";
import path from "node:path";
import { git, matchesAny, normalizePath, projectRoot, readConfig, splitNull, unique } from "./utils.mjs";

const IMPACT = { none: 0, low: 1, high: 2 };

function isTestFile(filename) {
  return /(^|\/)(test|tests)\//.test(filename) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filename);
}

function maxImpact(left, right) {
  return IMPACT[right] > IMPACT[left] ? right : left;
}

function upstreamBase(root, explicitBase) {
  if (explicitBase) return explicitBase;
  if (process.env.VERIFICATION_BASE) return process.env.VERIFICATION_BASE;
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: root, allowFailure: true });
  if (upstream.status !== 0) return null;
  const name = upstream.stdout.trim();
  if (!name) return null;
  const mergeBase = git(["merge-base", "HEAD", name], { cwd: root, allowFailure: true });
  return mergeBase.status === 0 ? mergeBase.stdout.trim() : null;
}

function untrackedPatch(root, filename) {
  const absolute = path.join(root, filename);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return "";
  if (fs.statSync(absolute).size > 512 * 1024) return "";
  return fs.readFileSync(absolute, "utf8").split(/\r?\n/).map(line => `+${line}`).join("\n");
}

export function getChangedFiles({ root = projectRoot, base, files } = {}) {
  if (files?.length) {
    const normalized = unique(files.flatMap(value => String(value).split(",")).filter(Boolean).map(normalizePath));
    return { base: "synthetic", files: normalized, patches: Object.fromEntries(normalized.map(file => [file, ""])) };
  }

  const selectedBase = upstreamBase(root, base);
  const names = [];
  if (selectedBase) {
    const committed = git(["diff", "--name-only", "-z", `${selectedBase}...HEAD`], { cwd: root, allowFailure: true });
    if (committed.status === 0) names.push(...splitNull(committed.stdout));
  }
  const working = git(["diff", "--name-only", "-z", "HEAD"], { cwd: root });
  names.push(...splitNull(working.stdout));
  const untracked = splitNull(git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root }).stdout);
  names.push(...untracked);

  const changed = unique(names).sort();
  const patches = {};
  for (const filename of changed) {
    const diffArgs = ["diff", "--no-ext-diff", "--unified=0"];
    if (selectedBase) diffArgs.push(selectedBase);
    else diffArgs.push("HEAD");
    diffArgs.push("--", filename);
    const result = git(diffArgs, { cwd: root, allowFailure: true });
    patches[filename] = result.stdout || (untracked.includes(filename) ? untrackedPatch(root, filename) : "");
  }
  return { base: selectedBase || "HEAD", files: changed, patches };
}

export function visualImpactForFile(filename, patch = "", defaultImpact = "none") {
  const file = normalizePath(filename);
  if (isTestFile(file)) return "none";
  if (/\.(css|scss|sass|less)$/.test(file)) return "high";
  if (!/\.(tsx|jsx)$/.test(file)) {
    if (/\.(json|ya?ml)$/.test(file) || /docs-platform\/(working|generated)\//.test(file)) return "none";
    return defaultImpact;
  }
  const changedLines = patch.split(/\r?\n/).filter(line => /^[+-](?![+-])/.test(line));
  if (changedLines.some(line => /className\s*=|style\s*=|\b(grid|flex|sticky|absolute|fixed)\b|<(div|section|article|aside|main|header|footer|nav|table|form|img|picture|video)\b/.test(line))) return "high";
  return "low";
}

export function dependencyClosure(directDomains, config) {
  const result = [...directDomains];
  const queue = [...directDomains];
  while (queue.length) {
    const current = queue.shift();
    for (const downstream of config.domains[current]?.downstream || []) {
      if (result.includes(downstream)) continue;
      result.push(downstream);
      queue.push(downstream);
    }
  }
  return result;
}

export function classifyAffected(changeSet, config) {
  const files = changeSet.files.filter(file => !matchesAny(file, config.ignoredPatterns));
  const domainIds = Object.keys(config.domains);
  const global = files.some(file => matchesAny(file, config.globalAffectedPatterns));
  const directDomains = global
    ? domainIds.filter(id => config.domains[id].releaseRequired !== false || id === "google-publisher")
    : domainIds.filter(id => files.some(file => matchesAny(file, config.domains[id].patterns)));
  const unmappedFiles = files.filter(file => !domainIds.some(id => matchesAny(file, config.domains[id].patterns)));
  for (const file of unmappedFiles) {
    const fallback = file.endsWith(".md") ? "documentation" : file.startsWith("docs-platform/") ? "governance" : "site-core";
    if (!directDomains.includes(fallback)) directDomains.push(fallback);
  }
  const runtimeDirectDomains = global ? directDomains : directDomains.filter(domainId => {
    const matching = files.filter(file => matchesAny(file, config.domains[domainId].patterns));
    return matching.some(file => !isTestFile(file));
  });
  const affectedDomains = unique([...directDomains, ...dependencyClosure(runtimeDirectDomains, config)]);
  const visualImpact = {};
  for (const domainId of affectedDomains) {
    const domain = config.domains[domainId];
    let impact = "none";
    if (directDomains.includes(domainId) && domain.visual?.route) {
      const matching = files.filter(file => matchesAny(file, domain.patterns));
      for (const file of matching) {
        impact = maxImpact(impact, visualImpactForFile(file, changeSet.patches?.[file], domain.visual.defaultImpact));
      }
    }
    visualImpact[domainId] = impact;
  }
  return { files, directDomains, affectedDomains, visualImpact, unmappedFiles, globalInvalidation: global };
}

export function affectedFromWorkingTree(options = {}) {
  const config = options.config || readConfig(options.root);
  const changes = getChangedFiles(options);
  return { ...changes, ...classifyAffected(changes, config) };
}
