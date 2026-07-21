export type RegistryDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  google_file_id: string | null;
  template: string | null;
  sections: string[];
  updated_at: string;
  local_path?: string | null;
};

export type DocumentSnapshot = {
  documentId: string;
  title: string;
  type: string;
  sections: string[];
  text: string;
  folderVerified: boolean;
};

export type ChangeRecord = { id: string; status: string; decisionId: string; hash: string; file: string; value: Record<string, unknown> };
export type ValidationResult = { valid: boolean; errors: string[] };

export interface PlatformAdapter {
  projectStatus(): Promise<Record<string, unknown>>;
  validateRegistry(): Promise<ValidationResult>;
  listDocuments(): Promise<Array<Pick<RegistryDocument, "id" | "title" | "type" | "status" | "sections" | "updated_at">>>;
  readDocument(documentId: string): Promise<DocumentSnapshot>;
  readSpreadsheet(documentId: string, sheet: string, range: string): Promise<{ documentId: string; sheet: string; range: string; values: string[][]; folderVerified: boolean }>;
  replaceBlock(input: { documentId: string; before: string; after: string; expectedSourceHash: string }): Promise<void>;
  getDecision(decisionId: string): Promise<Record<string, unknown> | null>;
  isDecisionApproved(decisionId: string): Promise<boolean>;
  getChange(changeId: string): Promise<ChangeRecord | null>;
  registryHash(): Promise<string>;
  previewRegistryChange(change: ChangeRecord): Promise<{ output: string; warnings: string[] }>;
  applyRegistryChange(change: ChangeRecord): Promise<{ output: string; validation: ValidationResult }>;
}

export type DocumentPreview = {
  kind: "document";
  previewId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  documentId: string;
  decisionId: string;
  sourceHash: string;
  blockId: string;
  before: string;
  after: string;
  operationHash: string;
};

export type RegistryPreview = {
  kind: "registry";
  previewId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  changeId: string;
  decisionId: string;
  sourceHash: string;
  changeHash: string;
  operationHash: string;
};

export type Preview = DocumentPreview | RegistryPreview;
