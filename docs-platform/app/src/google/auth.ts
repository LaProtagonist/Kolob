import fs from "node:fs";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { credentialsPath, loadConfig, tokenPath, writeSecretJson } from "./config.js";
import { requireProjectFolder } from "./guard.js";
import { GOOGLE_SCOPES, type StructuredEvent } from "./types.js";

const secretKeys = /^(accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret|authorization)$/i;
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

function installedCredentials() {
  if (!fs.existsSync(credentialsPath)) throw new Error(`OAuth credentials not found: ${credentialsPath}.`);
  const source = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const installed = source.installed ?? source.web;
  if (!installed?.client_id || !installed?.client_secret) throw new Error("Invalid OAuth credentials JSON: expected installed Desktop application metadata.");
  return installed as { client_id: string; client_secret: string };
}

export function projectFolderPickerUrl(input: { clientId: string; redirectUri: string; folderId: string; state: string }) {
  const client = new google.auth.OAuth2(input.clientId, "unused", input.redirectUri);
  const url = new URL(client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    redirect_uri: input.redirectUri,
    scope: [...GOOGLE_SCOPES],
    state: input.state,
  }));
  url.searchParams.set("trigger_onepick", "true");
  url.searchParams.set("allow_folder_selection", "true");
  url.searchParams.set("file_ids", input.folderId);
  return url.toString();
}

export async function authorizeProjectFolderInteractively() {
  const installed = installedCredentials();
  const folderId = requireProjectFolder(loadConfig());
  const state = randomBytes(24).toString("hex");
  const server = http.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start the local OAuth callback server.");
  }
  const redirectUri = `http://127.0.0.1:${address.port}`;
  const authUrl = projectFolderPickerUrl({ clientId: installed.client_id, redirectUri, folderId, state });
  log({ event: "oauth_folder_picker_ready", authorization_url: authUrl });

  try {
    const result = await new Promise<{ code: string }>((resolve, reject) => {
      server.once("request", (request, response) => {
        try {
          const callback = new URL(request.url ?? "/", redirectUri);
          if (callback.searchParams.get("state") !== state) throw new Error("OAuth state mismatch.");
          if (callback.searchParams.has("error")) throw new Error(`OAuth authorization was rejected: ${callback.searchParams.get("error")}.`);
          const code = callback.searchParams.get("code");
          if (!code) throw new Error("OAuth callback did not contain an authorization code.");
          const pickedIds = (callback.searchParams.get("picked_file_ids") ?? "").split(",").filter(Boolean);
          if (!pickedIds.includes(folderId)) throw new Error("The configured project folder was not selected; no token was saved.");
          response.end("Authorization successful. You can return to Codex.");
          resolve({ code });
        } catch (error) {
          response.statusCode = 400;
          response.end("Authorization failed. Return to Codex for details.");
          reject(error);
        }
      });
    });

    const client = new google.auth.OAuth2(installed.client_id, installed.client_secret, redirectUri);
    const { tokens } = await client.getToken({ code: result.code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) throw new Error("Authorization completed without a refresh token; no token was saved.");
    writeSecretJson(tokenPath, tokens);
    log({ event: "oauth_project_folder_authorized", scopes: GOOGLE_SCOPES, picked_folder: `${folderId.slice(0, 4)}…` });
  } catch (error) {
    const message = (error as Error).message;
    if (/access_denied|cancel|denied|rejected/i.test(message)) throw new Error("OAuth project-folder authorization was cancelled or denied; no token was saved.");
    throw new Error(`OAuth project-folder authorization failed: ${message}`);
  } finally {
    server.close();
  }
}
