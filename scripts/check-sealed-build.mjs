import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commitIndex = process.argv.indexOf("--commit");
const requestedCommit = commitIndex >= 0 ? process.argv[commitIndex + 1] : "HEAD";
const commit = run("git", ["rev-parse", requestedCommit], projectRoot).trim();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-sealed-build-"));
const worktree = path.join(temporaryRoot, "checkout");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    throw new Error([`${command} ${args.join(" ")} failed (${result.status})`, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function distSha256(directory) {
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (relative === "__review" || relative.startsWith("__review/")) continue;
        visit(absolute);
      } else if (entry.isFile() && relative !== "deployment-manifest.json") {
        const bytes = fs.readFileSync(absolute);
        entries.push({ path: relative, sha256: sha256(bytes), bytes: bytes.length });
      }
    }
  }
  visit(directory);
  return sha256(canonical(entries.sort((left, right) => left.path.localeCompare(right.path))));
}

let added = false;
try {
  run("git", ["worktree", "add", "--detach", worktree, commit], projectRoot);
  added = true;
  if (fs.existsSync(path.join(worktree, "dist"))) throw new Error("Clean worktree unexpectedly contains a prebuilt dist directory.");
  const started = Date.now();
  run("npm", ["ci"], worktree);
  run("npm", ["run", "build"], worktree);
  const snapshot = JSON.parse(fs.readFileSync(path.join(worktree, "src", "content", "capex-configurator-data.json"), "utf8"));
  const trackedChanges = run("git", ["status", "--short", "--untracked-files=no"], worktree).trim();
  if (trackedChanges) throw new Error(`Build changed tracked files:\n${trackedChanges}`);
  console.log(JSON.stringify({
    validation: "passed",
    commit,
    content_state_sha256: snapshot.meta.contentStateSha256,
    dist_sha256: distSha256(path.join(worktree, "dist")),
    prebuilt_dist_used: false,
    tracked_changes_after_build: false,
    elapsed_ms: Date.now() - started,
  }, null, 2));
} finally {
  if (added) spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: projectRoot, stdio: "ignore" });
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
