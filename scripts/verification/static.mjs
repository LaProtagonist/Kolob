import fs from "node:fs";
import path from "node:path";
import { getChangedFiles } from "./affected.mjs";
import { git, isMain, matchesAny, projectRoot, readConfig } from "./utils.mjs";

function checkDiff(root = projectRoot) {
  const result = git(["diff", "--check", "HEAD"], { cwd: root, allowFailure: true });
  if (result.status !== 0) throw new Error((result.stdout || result.stderr).trim());
  const config = readConfig(root);
  const { files } = getChangedFiles({ root });
  const failures = [];
  for (const filename of files.filter(file => !matchesAny(file, config.ignoredPatterns))) {
    const absolute = path.join(root, filename);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size > 1024 * 1024) continue;
    if (!/\.(c?js|mjs|ts|tsx|json|md|ya?ml|css|html)$/.test(filename)) continue;
    const text = fs.readFileSync(absolute, "utf8");
    if (/[^\S\r\n]+$/m.test(text)) failures.push(`${filename}: trailing whitespace`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return `diff check: OK (${files.length} changed paths)`;
}

function checkDocumentation(root = projectRoot) {
  const config = readConfig(root);
  const { files } = getChangedFiles({ root });
  const markdown = files.filter(file => file.endsWith(".md") && !matchesAny(file, config.ignoredPatterns));
  const failures = [];
  for (const filename of markdown) {
    const absolute = path.join(root, filename);
    if (!fs.existsSync(absolute)) continue;
    const text = fs.readFileSync(absolute, "utf8");
    if (text.includes("\0")) failures.push(`${filename}: NUL byte`);
    if (text.length && !text.endsWith("\n")) failures.push(`${filename}: missing final newline`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return `documentation static: OK (${markdown.length} files)`;
}

export function validateConfig(config = readConfig()) {
  const errors = [];
  if (!Number.isInteger(config.version)) errors.push("version must be an integer");
  for (const [domainId, domain] of Object.entries(config.domains || {})) {
    if (!Array.isArray(domain.patterns) || !domain.patterns.length) errors.push(`${domainId}: patterns are required`);
    for (const relation of [...(domain.upstream || []), ...(domain.downstream || [])]) {
      if (!config.domains[relation]) errors.push(`${domainId}: unknown related domain ${relation}`);
    }
    for (const checkId of [...(domain.fast || []), ...(domain.targeted || []), ...(domain.integration || []), ...(domain.dependency || [])]) {
      if (!config.checks[checkId]) errors.push(`${domainId}: unknown check ${checkId}`);
    }
    if (domain.visual?.route && !domain.visual.route.startsWith("/")) errors.push(`${domainId}: visual route must start with /`);
  }
  for (const checkId of config.release?.alwaysRun || []) {
    if (!config.checks[checkId]) errors.push(`release: unknown check ${checkId}`);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) {
      errors.push(`downstream cycle at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of config.domains[id].downstream || []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(config.domains || {})) visit(id);
  if (errors.length) throw new Error(errors.join("\n"));
  return `verification config: OK (${Object.keys(config.domains).length} domains, ${Object.keys(config.checks).length} checks)`;
}

export function runStatic(command) {
  if (command === "diff") return checkDiff();
  if (command === "documentation") return checkDocumentation();
  if (command === "config") return validateConfig();
  throw new Error(`Unknown static check: ${command}`);
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(`${runStatic(process.argv[2])}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
