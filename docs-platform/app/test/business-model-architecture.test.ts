import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const platform = path.resolve(import.meta.dirname, "../..");
const expected = [
  ["PRP-BMA-001", "Ядро бизнес-модели", "f9208f6bf699e6d9a92e4a970c0de50d0e1f2e2161ba388b8c11a0b639fdfd27"],
  ["PRP-BMA-002", "Практическая основа и задача нового этапа", "33033f64ead18b6d256c14d5c8594ac6a41b3a9992e12aaf291db9a0b7795ccd"],
  ["PRP-BMA-003", "Архитектура точки сети", "0970c8223baa35693dc18da59633bf2e392d14bad29aea362d0a7c09c6db7127"],
  ["PRP-BMA-004", "Цепочка создания продукта и ценности для гостя", "53182dd0fa07fa8862d2cbe9af630773d389a3854ce54772192256d78923487e"],
  ["PRP-BMA-005", "Контуры бизнеса и денежных потоков", "21c4cf97a1591cf1845174ac602eca7de81469961323eb619c238cdf6ef67564"],
  ["PRP-BMA-006", "Механика масштабирования", "cea003bcbd8cbad1fc22b427981647ca1b1800348e56067bd68903cade79ce4b"],
  ["PRP-BMA-007", "Развитие собственной инфраструктуры сети", "ca7fb0854ef1d34fff0b3a65154a965e33e1400143e546f1c2d94526b90b27ce"],
  ["PRP-BMA-008", "Раздельный расчёт экономических контуров", "453d10094e3d8ee7c8a6a097fe81e85c0010515b181482b4ab85c914cfda8562"],
  ["PRP-BMA-009", "Границы и статус бизнес-модели", "d88fec7d3b9a8d9689970a2284f0bd8b268c4a247ff45621736c5a2fc8046f4e"],
  ["PRP-BMA-010", "Требования к финансовой модели", "f32eeb1e9d2a71b50505eb96a7194f1185ee668394c6ba9294937c7fcb5d622f"]
] as const;

function readYaml<T>(relativePath: string): T {
  return YAML.parse(fs.readFileSync(path.join(platform, relativePath), "utf8")) as T;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("Business Model Architecture v1.0 is registered with ten exact approved canonical blocks", () => {
  const document = fs.readFileSync(path.join(platform, "01-business-model-architecture.md"), "utf8");
  const documents = readYaml<{ documents: Array<Record<string, unknown>> }>("registry/documents.yaml").documents;
  const principles = readYaml<{ principles: Array<Record<string, unknown>> }>("registry/principles.yaml").principles;
  const change = readYaml<{ operations: Array<{ entity: string; value?: Record<string, unknown> }> }>("changes/CHG-006-business-model-architecture-v1.yaml");
  const changePrinciples = change.operations.filter(operation => operation.entity === "principles").map(operation => operation.value!);
  const bma = documents.find(item => item.id === "DOC-BUSINESS-MODEL-ARCHITECTURE");

  assert.equal(
    document.startsWith(
      "# Business Model Architecture\n**Проект:** «Колобочная»  \n**Документ:** Архитектура бизнес-модели  \n**Версия:** 1.0  \n**Статус:** Approved  \n**Основание:** Foundation v1.0\n"
    ),
    true
  );
  assert.deepEqual(bma, {
    id: "DOC-BUSINESS-MODEL-ARCHITECTURE",
    title: "Business Model Architecture",
    type: "internal_governing_business_architecture_document",
    status: "approved",
    google_file_id: null,
    template: null,
    sections: expected.map(([id]) => id),
    version: "1.0",
    governance_level: "governing",
    local_path: "docs-platform/01-business-model-architecture.md",
    updated_at: "2026-08-01"
  });

  assert.deepEqual(changePrinciples.map(item => item.id), expected.map(([id]) => id));
  assert.deepEqual(
    principles.filter(item => item.document === "DOC-BUSINESS-MODEL-ARCHITECTURE").map(item => item.id),
    expected.map(([id]) => id)
  );
  assert.equal(principles.length, 17);

  let previousSectionStart = -1;
  for (const [index, [id, title, expectedHash]] of expected.entries()) {
    const canonicalText = changePrinciples[index].canonical_text as string;
    const principle = principles.find(item => item.id === id);
    assert.deepEqual(principle, {
      id,
      title,
      document: "DOC-BUSINESS-MODEL-ARCHITECTURE",
      status: "approved",
      version: "1.0",
      canonical_text: canonicalText,
      priority: "governing",
      source_ids: ["SRC-BMA-V1-APPROVAL"],
      decision_id: "DEC-004",
      updated_at: "2026-08-01"
    });
    assert.equal(sha256(canonicalText), expectedHash, `${id} canonical payload hash differs`);

    const marker = `## ${index + 1}. ${title}\n\n**Идентификатор:** ${id}  \n**Статус:** Approved\n\n`;
    const sectionStart = document.indexOf(marker);
    assert.ok(sectionStart > previousSectionStart, `${id} heading is missing or out of order`);
    previousSectionStart = sectionStart;
    const bodyStart = sectionStart + marker.length;
    const boundary = document.indexOf("\n\n⸻", bodyStart);
    const bodyEnd = boundary >= 0 ? boundary : document.endsWith("\n") ? document.length - 1 : document.length;
    const documentText = document.slice(bodyStart, bodyEnd);
    assert.equal(documentText, canonicalText, `${id} document text differs from the approved canonical payload`);
    assert.equal(sha256(documentText), expectedHash, `${id} document hash differs`);
  }

  const bma001 = changePrinciples[0].canonical_text as string;
  assert.equal(bma001.includes("на транспортных маршрутах, фудкортах и в других форматах"), true);
  assert.equal(document.includes("автозаправочных станциях"), false);
  assert.equal(principles.some(item => String(item.canonical_text).includes("автозаправочных станциях")), false);
});

test("Business Model Architecture decision, source and approved change sets are exact", () => {
  const sources = readYaml<{ sources: Array<Record<string, unknown>> }>("registry/sources.yaml").sources;
  const decisions = readYaml<{ decisions: Array<Record<string, unknown>> }>("registry/decisions.yaml").decisions;
  const decisionChange = readYaml<Record<string, unknown>>("changes/CHG-005-business-model-architecture-decision.yaml");
  const documentChange = readYaml<Record<string, unknown>>("changes/CHG-006-business-model-architecture-v1.yaml");

  assert.deepEqual(sources.find(item => item.id === "SRC-BMA-V1-APPROVAL"), {
    id: "SRC-BMA-V1-APPROVAL",
    title: "Утверждённое задание Business Model Architecture v1.0",
    type: "instruction",
    location: "User instruction, 2026-08-01",
    publisher: "project owner",
    publication_date: "2026-08-01",
    accessed_at: "2026-08-01",
    reliability: "primary",
    notes: "Первичный источник статуса и канонических текстов Business Model Architecture v1.0."
  });
  assert.deepEqual(decisions.find(item => item.id === "DEC-004"), {
    id: "DEC-004",
    title: "Зарегистрировать Business Model Architecture v1.0 как управляющий документ",
    status: "approved",
    decision: "Создать и зарегистрировать Business Model Architecture v1.0 как внутренний управляющий документ архитектуры бизнес-модели проекта с десятью утверждёнными неизменяемыми положениями PRP-BMA-001—PRP-BMA-010.",
    rationale: "Прямое утверждённое задание владельца проекта от 2026-08-01.",
    affected_documents: ["DOC-BUSINESS-MODEL-ARCHITECTURE"],
    approved_by: "project owner",
    approved_at: "2026-08-01",
    supersedes: null,
    source_ids: ["SRC-BMA-V1-APPROVAL"],
    updated_at: "2026-08-01"
  });
  assert.equal(decisionChange.change_id, "CHG-005");
  assert.equal(decisionChange.status, "approved");
  assert.equal(decisionChange.decision_id, "DEC-001");
  assert.equal(documentChange.change_id, "CHG-006");
  assert.equal(documentChange.status, "approved");
  assert.equal(documentChange.decision_id, "DEC-004");
});

test("Foundation governs Business Model Architecture and BMA governs only declared dependent documents", () => {
  const dependencies = readYaml<{ dependencies: Array<Record<string, unknown>> }>("registry/dependencies.yaml").dependencies;
  const foundation = dependencies.find(item => item.id === "DEP-FOUNDATION-DERIVED-DOCUMENTS") as { target_documents: Array<Record<string, unknown>>; updated_at: string };
  const bma = dependencies.find(item => item.id === "DEP-BMA-DERIVED-DOCUMENTS");

  assert.deepEqual(
    foundation.target_documents.find(item => item.title === "Business Model Architecture"),
    { title: "Business Model Architecture", document_id: "DOC-BUSINESS-MODEL-ARCHITECTURE" }
  );
  assert.equal(foundation.updated_at, "2026-08-01");
  assert.deepEqual(bma, {
    id: "DEP-BMA-DERIVED-DOCUMENTS",
    source_document_id: "DOC-BUSINESS-MODEL-ARCHITECTURE",
    priority: "governing_source",
    status: "approved",
    version: "1.0",
    target_documents: [
      { title: "CAPEX — Equipment Specification", document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION" },
      { title: "Financial Model", document_id: null },
      { title: "Investment Memorandum", document_id: "DOC-INVESTMENT-MEMO" },
      { title: "Infrastructure Strategy", document_id: null },
      { title: "Network Development Model", document_id: null }
    ],
    updated_at: "2026-08-01"
  });
});

test("Business Model Architecture applications are journaled", () => {
  const changelog = path.join(platform, "changelog");
  const files = fs.readdirSync(changelog);
  const log = fs.readFileSync(path.join(changelog, "changes.log"), "utf8");
  assert.equal(files.some(file => file.endsWith("-CHG-005.md")), true);
  assert.equal(files.some(file => file.endsWith("-CHG-006.md")), true);
  assert.match(log, / CHG-005 decision=DEC-001 touched=sources,decisions/);
  assert.match(log, / CHG-006 decision=DEC-004 touched=documents,principles,dependencies,decisions/);
});
