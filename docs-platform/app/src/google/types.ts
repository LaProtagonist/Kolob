export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file"] as const;
export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const DOC_MIME = "application/vnd.google-apps.document";
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export type GoogleConfig = { projectFolderId: string; projectFolderName: string; testMode: boolean };
export type TestManifest = { version: 1; projectFolderId: string; docId: string; sheetId: string; createdAt: string };
export type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean; capabilities?: { canEdit?: boolean; canDelete?: boolean }; webViewLink?: string };
export type StructuredEvent = { event: string; [key: string]: unknown };
