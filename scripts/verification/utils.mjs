import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const cacheRoot = path.join(projectRoot, ".cache", "verification");

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function shortHash(value) {
  return String(value || "").slice(0, 8);
}

export function normalizePath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

export function readConfig(root = projectRoot) {
  const filename = path.join(root, "verification", "domains.json");
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

export function globToRegExp(glob) {
  const value = normalizePath(glob);
  let source = "^";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "*") {
      if (value[index + 1] === "*") {
        index += 1;
        if (value[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

const globCache = new Map();

export function matchesGlob(filename, glob) {
  if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
  return globCache.get(glob).test(normalizePath(filename));
}

export function matchesAny(filename, patterns = []) {
  return patterns.some(pattern => matchesGlob(filename, pattern));
}

export function unique(values) {
  return [...new Set(values)];
}

export function parseCli(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    if (equals > 0) {
      flags.set(value.slice(2, equals), value.slice(equals + 1));
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { positional, flags };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (options.allowFailure !== true && result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

export function git(args, options = {}) {
  return run("git", args, options);
}

export function splitNull(value) {
  return value.split("\0").filter(Boolean).map(normalizePath);
}

export function repositoryFiles(root = projectRoot) {
  const result = git(["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, allowFailure: true });
  if (result.status === 0) return splitNull(result.stdout);
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".cache", "dist", "node_modules"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(normalizePath(path.relative(root, absolute)));
    }
  };
  visit(root);
  return files.sort();
}

export function ensureCacheDirectories(root = cacheRoot) {
  fs.mkdirSync(path.join(root, "logs"), { recursive: true });
  fs.mkdirSync(path.join(root, "screenshots"), { recursive: true });
}

export function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filename);
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function isMain(importMetaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}

export function relativeFromRoot(filename, root = projectRoot) {
  return normalizePath(path.relative(root, filename));
}
