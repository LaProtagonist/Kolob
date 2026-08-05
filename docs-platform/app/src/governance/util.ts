import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";

export const projectRoot = path.resolve(platformRoot, "..");

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function fileSha256(file: string): string {
  return sha256(fs.readFileSync(file));
}

export function readYaml<T = any>(file: string): T {
  return YAML.parse(fs.readFileSync(file, "utf8")) as T;
}

export function yamlText(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0, sortMapEntries: false });
}

export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

export function writeYaml(file: string, value: unknown): void {
  atomicWrite(file, yamlText(value));
}

export function relativeToProject(file: string): string {
  return path.relative(projectRoot, file).replaceAll(path.sep, "/");
}

export function resolveProjectPath(relativePath: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`Path is outside the project: ${relativePath}`);
  }
  return resolved;
}

export function git(args: string[], options: { encoding?: "utf8" | "buffer"; allowFailure?: boolean } = {}): string | Buffer {
  try {
    return execFileSync("git", ["-C", projectRoot, ...args], {
      encoding: options.encoding === "buffer" ? undefined : "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (options.allowFailure) return options.encoding === "buffer" ? Buffer.alloc(0) : "";
    const detail = error as { stderr?: Buffer | string; message?: string };
    throw new Error(String(detail.stderr || detail.message || error).trim());
  }
}

export function gitText(args: string[], allowFailure = false): string {
  return String(git(args, { encoding: "utf8", allowFailure })).trim();
}

export function gitBuffer(args: string[], allowFailure = false): Buffer {
  const value = git(args, { encoding: "buffer", allowFailure });
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

export function gitObjectExists(reference: string): boolean {
  try {
    execFileSync("git", ["-C", projectRoot, "cat-file", "-e", reference], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function blobAt(commit: string, relativePath: string): Buffer | null {
  const reference = `${commit}:${relativePath}`;
  return gitObjectExists(reference) ? gitBuffer(["show", reference]) : null;
}

export function treeFileHash(commit: string, relativePath: string): string | null {
  const blob = blobAt(commit, relativePath);
  return blob ? sha256(blob) : null;
}

export function scopeHash(paths: string[], commit?: string): string {
  const entries = [...new Set(paths)].sort().map(relativePath => {
    const bytes = commit ? blobAt(commit, relativePath) : (fs.existsSync(resolveProjectPath(relativePath)) ? fs.readFileSync(resolveProjectPath(relativePath)) : null);
    return { path: relativePath, sha256: bytes ? sha256(bytes) : null };
  });
  return sha256(canonical(entries));
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function addMilliseconds(timestamp: string, offset: number): string {
  return new Date(Date.parse(timestamp) + offset).toISOString();
}

export function secretShaped(value: unknown): boolean {
  return /(?:refresh[_-]?token|access[_-]?token|client[_-]?secret|authorization|private[_-]?key)/i.test(JSON.stringify(value));
}
