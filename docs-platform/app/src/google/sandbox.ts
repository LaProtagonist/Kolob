import type { DriveFile, GoogleConfig, TestManifest } from "./types.js";
import { assertFileInProjectFolder, requireProjectFolder } from "./guard.js";

export function requireApprovedApply(approved: boolean, explicitApply: boolean) { if (!explicitApply) throw new Error("Apply requires the explicit --apply flag."); if (!approved) throw new Error("Apply requires an existing approved decision."); }
export function cleanupTargets(manifest: TestManifest, config: GoogleConfig) { if (manifest.projectFolderId !== requireProjectFolder(config)) throw new Error("Manifest project folder does not match local configuration."); return [manifest.docId, manifest.sheetId]; }
export async function reuseOrCreateTests(input: { manifest: TestManifest | null; config: GoogleConfig; getFile: (id: string) => Promise<DriveFile>; createDocument: () => Promise<string>; createSpreadsheet: () => Promise<string>; save: (manifest: TestManifest) => void }) {
  if (input.manifest) { for (const id of cleanupTargets(input.manifest, input.config)) assertFileInProjectFolder(await input.getFile(id), input.config); return { manifest: input.manifest, created: false }; }
  const docId = await input.createDocument(); const sheetId = await input.createSpreadsheet(); const manifest: TestManifest = { version: 1, projectFolderId: requireProjectFolder(input.config), docId, sheetId, createdAt: new Date().toISOString() }; input.save(manifest); return { manifest, created: true };
}
