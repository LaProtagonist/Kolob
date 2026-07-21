import fs from "node:fs";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { credentialsPath, tokenPath, writeSecretJson } from "./config.js";
import { GOOGLE_SCOPES, type StructuredEvent } from "./types.js";

const secretKeys = /token|secret|credential|authorization/i;
export function log(event: StructuredEvent) { const safe = Object.fromEntries(Object.entries(event).map(([key, value]) => [key, secretKeys.test(key) ? "[REDACTED]" : value])); console.log(JSON.stringify(safe)); }
export function credentialState() { return { credentials: fs.existsSync(credentialsPath), token: fs.existsSync(tokenPath) }; }
export async function getAuthorizedClient() {
  if (!fs.existsSync(credentialsPath)) throw new Error(`OAuth credentials not found: ${credentialsPath}. Put the downloaded Desktop OAuth JSON there locally; never commit it.`);
  if (!fs.existsSync(tokenPath)) throw new Error("OAuth token not found. Run npm run google:auth in an interactive local terminal.");
  const source = JSON.parse(fs.readFileSync(credentialsPath, "utf8")); const installed = source.installed ?? source.web;
  if (!installed?.client_id || !installed?.redirect_uris?.[0]) throw new Error("Invalid OAuth credentials JSON: expected installed Desktop application metadata.");
  const client = new google.auth.OAuth2(installed.client_id, installed.client_secret, installed.redirect_uris[0]); client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8"))); return client;
}
export async function authorizeInteractively() {
  if (!fs.existsSync(credentialsPath)) throw new Error(`OAuth credentials not found: ${credentialsPath}.`);
  try { const client = await authenticate({ scopes: [...GOOGLE_SCOPES], keyfilePath: credentialsPath }); if (!client.credentials.refresh_token) throw new Error("Authorization completed without a refresh token. Revoke the app grant and authorize again so offline access can be stored."); writeSecretJson(tokenPath, client.credentials); log({ event: "oauth_authorized", scopes: GOOGLE_SCOPES }); }
  catch (error) { const message = (error as Error).message; if (/access_denied|cancel|denied/i.test(message)) throw new Error("OAuth authorization was cancelled or denied; no token was saved."); throw new Error(`OAuth authorization failed: ${message}`); }
}
