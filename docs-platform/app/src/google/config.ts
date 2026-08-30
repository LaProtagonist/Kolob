import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GoogleConfig, TestManifest } from "./types.js";
export const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const secretsDir = path.join(platformRoot, ".secrets");
// A feature worktree may deliberately reuse the project-approved local Google
// profile without copying its config or OAuth secrets into the worktree.
export const configPath = process.env.GOOGLE_CONFIG_PATH || path.join(platformRoot, "config", "google.json");
export const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || path.join(secretsDir, "credentials.json");
export const tokenPath = process.env.GOOGLE_TOKEN_PATH || path.join(secretsDir, "token.json");
export const manifestPath = path.join(secretsDir, "test-manifest.json");
export const pendingRegistryChangePath = path.join(secretsDir, "registry-test-documents.change.yaml");
export function loadConfig(): GoogleConfig { if (!fs.existsSync(configPath)) throw new Error(`Google config not found: ${configPath}. Copy config/google.example.json to config/google.json and set projectFolderId locally.`); const value = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<GoogleConfig>; if (typeof value.projectFolderName !== "string" || typeof value.testMode !== "boolean" || typeof value.projectFolderId !== "string") throw new Error("Invalid google.json: projectFolderId, projectFolderName and testMode are required."); return value as GoogleConfig; }
export function saveConfig(config: GoogleConfig) { writeSecretJson(configPath, config); }
export function readManifest(): TestManifest { if (!fs.existsSync(manifestPath)) throw new Error("Test manifest not found. Run google:test:create after OAuth authorization."); return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as TestManifest; }
export function writeSecretJson(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, file); }
