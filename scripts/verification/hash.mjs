import fs from "node:fs";
import path from "node:path";
import { matchesAny, normalizePath, projectRoot, readConfig, repositoryFiles, sha256, unique } from "./utils.mjs";

function hashEntries(root, files) {
  const hash = sha256(files.sort().map(filename => {
    const absolute = path.join(root, filename);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return `${filename}\0missing`;
    return `${filename}\0${sha256(fs.readFileSync(absolute))}`;
  }).join("\n"));
  return { hash, files: files.sort() };
}

function filesForPatterns(files, patterns) {
  return files.filter(filename => matchesAny(filename, patterns));
}

function upstreamDomains(config, domainId, seen = new Set()) {
  if (seen.has(domainId)) return [];
  seen.add(domainId);
  const result = [];
  for (const upstream of config.domains[domainId]?.upstream || []) {
    result.push(upstream, ...upstreamDomains(config, upstream, seen));
  }
  return unique(result);
}

export function environmentFingerprint(config, root = projectRoot, files = repositoryFiles(root)) {
  const dependencyFiles = filesForPatterns(files, config.globalHashInputs || []);
  const dependencies = hashEntries(root, dependencyFiles);
  return {
    nodeMajor: Number(process.versions.node.split(".")[0]),
    platform: process.platform,
    arch: process.arch,
    dependencyHash: dependencies.hash,
    dependencyFiles: dependencies.files,
  };
}

export function computeDomainFingerprint({
  root = projectRoot,
  config = readConfig(root),
  domainId,
  level = "targeted",
  profile = "direct",
  checks = [],
  visualImpact = "none",
  files = repositoryFiles(root),
} = {}) {
  const domain = config.domains[domainId];
  if (!domain) throw new Error(`Unknown domain: ${domainId}`);
  const sourceFiles = filesForPatterns(files, domain.patterns || []);
  const upstreamIds = upstreamDomains(config, domainId);
  const upstreamFiles = unique(upstreamIds.flatMap(id => filesForPatterns(files, config.domains[id].patterns || [])));
  const testFiles = filesForPatterns(files, domain.testInputs || []);
  const runnerFiles = filesForPatterns(files, config.runnerInputs || []);
  const source = hashEntries(root, sourceFiles);
  const upstream = hashEntries(root, upstreamFiles);
  const tests = hashEntries(root, testFiles);
  const runner = hashEntries(root, runnerFiles);
  const environment = environmentFingerprint(config, root, files);
  const checkDefinitions = Object.fromEntries(checks.map(id => [id, config.checks[id]]));
  const testDefinitionHash = sha256(JSON.stringify({ checks: checkDefinitions, testFilesHash: tests.hash }));
  const runnerVersionHash = sha256(JSON.stringify({ mapVersion: config.version, cacheVersion: config.cacheVersion, runnerFilesHash: runner.hash }));
  const dependencyHash = sha256(JSON.stringify({ upstream: upstream.hash, dependencies: environment.dependencyHash }));
  const inputHash = sha256(JSON.stringify({
    domain: domainId,
    level,
    profile,
    source: source.hash,
    dependencyHash,
    testDefinitionHash,
    runnerVersionHash,
    environment: { nodeMajor: environment.nodeMajor, platform: environment.platform, arch: environment.arch },
  }));
  return {
    domain: domainId,
    level,
    profile,
    inputHash,
    sourceHash: source.hash,
    dependencyHash,
    testDefinitionHash,
    runnerVersionHash,
    environmentFingerprint: sha256(JSON.stringify(environment)),
    visualImpact,
    inputs: source.files,
    upstreamInputs: upstream.files,
    testInputs: tests.files,
  };
}

export function fingerprintMatches(receipt, fingerprint) {
  return Boolean(receipt
    && receipt.result === "PASS"
    && receipt.domain === fingerprint.domain
    && receipt.level === fingerprint.level
    && receipt.profile === fingerprint.profile
    && receipt.inputHash === fingerprint.inputHash
    && receipt.dependencyHash === fingerprint.dependencyHash
    && receipt.testDefinitionHash === fingerprint.testDefinitionHash
    && receipt.runnerVersionHash === fingerprint.runnerVersionHash
    && receipt.environmentFingerprint === fingerprint.environmentFingerprint);
}
