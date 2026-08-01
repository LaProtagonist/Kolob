import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { parseMarkdown, renderInline, semanticSegments } from "../src/google/markdown.js";
import { analyzeLocalPublicationDocuments, PROJECT_DOCUMENT_TARGETS, publicationPreviewForLog } from "../src/google/publisher.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function readYaml<T>(relativePath: string): T { return YAML.parse(fs.readFileSync(path.join(platform, relativePath), "utf8")) as T; }

test("publication allowlist contains exactly the three requested native Google Docs", () => {
  assert.deepEqual(PROJECT_DOCUMENT_TARGETS.map(target => target.googleTitle), [
    "00 — Foundation",
    "01 — Business Model Architecture",
    "02 — CAPEX — Спецификация оснащения пилотного объекта",
  ]);
});

test("Markdown renderer removes markup while retaining inline formatting ranges", () => {
  const rendered = renderInline("**Статус:** `research`");
  assert.equal(rendered.text, "Статус: research");
  assert.deepEqual(rendered.marks, [
    { start: 0, end: 7, bold: true },
    { start: 8, end: 16, code: true },
  ]);
});

test("publication analysis preserves hashes, statuses, sections, tables and CAPEX item count", () => {
  const documents = analyzeLocalPublicationDocuments();
  assert.equal(documents.length, 3);
  assert.deepEqual(documents.map(document => ({
    id: document.registryId,
    status: document.status,
    version: document.version,
    sections: document.sectionCount,
    tables: document.tableCount,
    blocks: document.registeredBlockCount,
    items: document.itemCount,
    sha256: document.sha256,
  })), [
    { id: "DOC-FOUNDATION", status: "approved", version: "1.0", sections: 10, tables: 0, blocks: 7, items: undefined, sha256: "5b4d457184c055ba11f8c4d05cc263139d2eb4f623981bcdc198c0114a50c0bb" },
    { id: "DOC-BUSINESS-MODEL-ARCHITECTURE", status: "approved", version: "1.0", sections: 10, tables: 6, blocks: 10, items: undefined, sha256: "1584d836a159f6e3c5859ccf539830248b2cd782ed2c7005c5963ac8730c556b" },
    { id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION", status: "research", version: "0.1", sections: 30, tables: 0, blocks: 5, items: 124, sha256: "2157364e09699173fecfbfe861edf4e6fac85a0437e23aebe100caebeab599d6" },
  ]);
});

test("semantic projection keeps table cell contents and omits Markdown horizontal rules", () => {
  const parsed = parseMarkdown("# Title\n\n---\n\nA\tB\n1\t2\n");
  assert.deepEqual(semanticSegments(parsed), ["Title", "A", "B", "1", "2"]);
  assert.equal(parsed.tableCount, 1);
});

test("preview log exposes only masked Google IDs", () => {
  const logged = publicationPreviewForLog({ previewId: "p", createdAt: "2026-08-01T00:00:00Z", folderName: "folder", folderCheck: "passed", decisionId: "DEC-006", targets: [{ registryId: "DOC-FOUNDATION", registryTitle: "Foundation", googleTitle: "00 — Foundation", localPath: "docs-platform/00-foundation.md", version: "1.0", status: "approved", bytes: 1, sha256: "a".repeat(64), sectionCount: 1, headingCount: 1, tableCount: 0, registeredBlockCount: 7, relatedDecisions: ["DEC-003", "DEC-006"], action: "update", googleFileId: "full-id", googleFileIdMasked: "full…l-id", folderCheck: "passed", warnings: [] }] });
  assert.equal("googleFileId" in logged.targets[0], false);
  assert.equal(logged.targets[0].googleFileIdMasked, "full…l-id");
});

test("publication decision, registry IDs, governed change and receipts cover exactly three documents", () => {
  const decisions = readYaml<{ decisions: Array<{ id: string; status: string; affected_documents: string[] }> }>("registry/decisions.yaml").decisions;
  const documents = readYaml<{ documents: Array<{ id: string; google_file_id: string | null; status: string }> }>("registry/documents.yaml").documents;
  const change = readYaml<{ change_id: string; decision_id: string; status: string; operations: Array<{ entity: string; id: string }> }>("changes/CHG-010-google-drive-publication.yaml");
  const targetIds = PROJECT_DOCUMENT_TARGETS.map(target => target.registryId);
  const decision = decisions.find(item => item.id === "DEC-006");
  assert.equal(decision?.status, "approved");
  assert.deepEqual(decision?.affected_documents, targetIds);
  assert.equal(change.change_id, "CHG-010");
  assert.equal(change.decision_id, "DEC-006");
  assert.equal(change.status, "approved");
  assert.deepEqual(change.operations.map(operation => operation.entity), ["documents", "documents", "documents"]);
  assert.deepEqual(change.operations.map(operation => operation.id), targetIds);
  for (const target of PROJECT_DOCUMENT_TARGETS) {
    const document = documents.find(item => item.id === target.registryId);
    assert.equal(typeof document?.google_file_id, "string");
    assert.equal(document?.status, target.status);
    const receipt = readYaml<{ registry_id: string; local_sha256: string; validation_status: string; readback: string }>(`changelog/google-sync/2026-08-01-${target.registryId}.yaml`);
    assert.equal(receipt.registry_id, target.registryId);
    assert.match(receipt.local_sha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.readback, "passed");
    assert.equal(receipt.validation_status, "passed");
  }
});
