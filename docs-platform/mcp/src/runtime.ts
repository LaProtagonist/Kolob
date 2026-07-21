import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Preview } from "./types.js";

const sensitiveKey = /^(access_?token|refresh_?token|client_?secret|credential|authorization|api_?key|password)$/i;
export function sha256(value: string) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
export function redact<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\b(access_?token|refresh_?token|client_?secret|api_?key|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]") as T;
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redact(item)])) as T;
  return value;
}
function atomicWrite(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8"); fs.renameSync(temporary, file); }

export class PreviewStore {
  constructor(private readonly root: string, private readonly ttlMs = 24 * 60 * 60 * 1000, private readonly now = () => new Date()) {}
  private file(id: string) { if (!/^prv-[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid preview ID."); return path.join(this.root, "previews", `${id}.json`); }
  create<T extends Omit<Preview, "previewId" | "createdAt" | "expiresAt">>(preview: T): Preview { const date = this.now(); const value = { ...preview, previewId: `prv-${randomUUID()}`, createdAt: date.toISOString(), expiresAt: new Date(date.getTime() + this.ttlMs).toISOString() } as unknown as Preview; atomicWrite(this.file(value.previewId), value); return value; }
  get(id: string) { const file = this.file(id); if (!fs.existsSync(file)) throw new Error("Preview not found."); return JSON.parse(fs.readFileSync(file, "utf8")) as Preview; }
  claim(id: string) { const preview = this.get(id); if (preview.consumedAt) throw new Error("Preview has already been applied."); if (Date.parse(preview.expiresAt) <= this.now().getTime()) throw new Error("Preview has expired; create a new preview."); preview.consumedAt = this.now().toISOString(); atomicWrite(this.file(id), preview); return preview; }
}

export class AuditLog {
  constructor(private readonly root: string) {}
  append(entry: Record<string, unknown>) { const timestamp = new Date().toISOString(); const file = path.join(this.root, "audit", `${timestamp.slice(0, 10)}.jsonl`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(redact({ timestamp, ...entry })) + "\n", "utf8"); }
}
