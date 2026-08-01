import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const platform = path.resolve(import.meta.dirname, "../..");
const documentPath = path.join(platform, "working", "capex-equipment-specification.md");
const expectedDocumentHash = "2157364e09699173fecfbfe861edf4e6fac85a0437e23aebe100caebeab599d6";
const moduleCounts = new Map([
  ["01", 47],
  ["02", 55],
  ["03", 19],
  ["04", 3]
]);

function readYaml<T>(relativePath: string): T {
  return YAML.parse(fs.readFileSync(path.join(platform, relativePath), "utf8")) as T;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function between(document: string, start: string, end: string): string {
  const startIndex = document.indexOf(start);
  const endIndex = document.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  assert.notEqual(endIndex, -1, `missing section boundary: ${end}`);
  return document.slice(startIndex + start.length, endIndex);
}

test("working CAPEX document preserves all four supplied modules and open sections", () => {
  const document = fs.readFileSync(documentPath, "utf8");
  const ids = [...document.matchAll(/CAPEX-(0[1-4])-(\d{3})/g)].map(match => match[0]);
  const expectedIds = [...moduleCounts.entries()].flatMap(([module, count]) =>
    Array.from({ length: count }, (_, index) => `CAPEX-${module}-${String(index + 1).padStart(3, "0")}`)
  );

  assert.equal(sha256(document), expectedDocumentHash);
  assert.deepEqual(ids, expectedIds);
  assert.equal(new Set(ids).size, 124);
  assert.match(document, /^# CAPEX — Equipment Specification$/m);
  assert.match(document, /\*\*Версия:\*\* 0\.1/);
  assert.match(document, /\*\*Статус:\*\* `research`/);
  assert.equal(
    document.includes("Документ определяет рабочий состав оборудования пилотного объекта. Цены, конкретные модели, стоимость монтажа и итоговый CAPEX будут добавляться поэтапно после уточнения помещения, производительности и технических требований"),
    true
  );
  assert.equal(document.includes("Аппарат шокового охлаждения пока не утверждён."), true);
  assert.equal(document.includes("2 POS-терминала\n+ 1 терминал заготовочного цеха\n+ 3 KDS-экрана\n= 6 рабочих устройств."), true);

  assert.equal((between(document, "## Открытые инженерные параметры CAPEX-03", "# CAPEX-04.").match(/^- /gm) ?? []).length, 12);
  assert.equal((between(document, "## Пока не детализированы в CAPEX-04", "# Что ещё не сформировано").match(/^- /gm) ?? []).length, 11);
  assert.equal((between(document, "## A. Открытые параметры уже описанных модулей", "## B. Ещё не описанные разделы CAPEX").match(/^- /gm) ?? []).length, 15);
  assert.equal((between(document, "## B. Ещё не описанные разделы CAPEX", "## Статус регистрации").match(/^\d+\. /gm) ?? []).length, 27);

  assert.equal(/[0-9]\s*(?:₽|руб(?:\.|лей|ля)?|RUB|USD|EUR)/u.test(document), false);
  assert.equal(document.includes("Итого CAPEX:"), false);
});

test("working CAPEX document is registered as research without assets, metrics or principles", () => {
  const documents = readYaml<{ documents: Array<Record<string, unknown>> }>("registry/documents.yaml").documents;
  const metrics = readYaml<{ metrics: Array<Record<string, unknown>> }>("registry/metrics.yaml").metrics;
  const principles = readYaml<{ principles: Array<Record<string, unknown>> }>("registry/principles.yaml").principles;
  const change = readYaml<{ operations: Array<{ entity: string }> }>("changes/CHG-008-capex-equipment-specification-v0-1.yaml");

  assert.deepEqual(documents.find(item => item.id === "DOC-CAPEX-EQUIPMENT-SPECIFICATION"), {
    id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION",
    title: "CAPEX — Equipment Specification",
    type: "working_capex_equipment_specification",
    status: "research",
    google_file_id: null,
    template: null,
    sections: ["CAPEX-01", "CAPEX-02", "CAPEX-03", "CAPEX-04", "Что ещё не сформировано"],
    version: "0.1",
    local_path: "docs-platform/working/capex-equipment-specification.md",
    updated_at: "2026-08-01"
  });
  assert.equal(metrics.length, 0);
  assert.equal(principles.length, 17);
  assert.deepEqual([...new Set(change.operations.map(operation => operation.entity))], ["documents", "dependencies", "decisions"]);
});

test("working CAPEX source, decision and dependencies retain research boundaries", () => {
  const sources = readYaml<{ sources: Array<Record<string, unknown>> }>("registry/sources.yaml").sources;
  const decisions = readYaml<{ decisions: Array<Record<string, unknown>> }>("registry/decisions.yaml").decisions;
  const dependencies = readYaml<{ dependencies: Array<Record<string, unknown>> }>("registry/dependencies.yaml").dependencies;
  const decisionChange = readYaml<Record<string, unknown>>("changes/CHG-007-capex-equipment-specification-decision.yaml");
  const documentChange = readYaml<Record<string, unknown>>("changes/CHG-008-capex-equipment-specification-v0-1.yaml");

  assert.deepEqual(sources.find(item => item.id === "SRC-CAPEX-EQUIPMENT-SPEC-V0-1-BRIEF"), {
    id: "SRC-CAPEX-EQUIPMENT-SPEC-V0-1-BRIEF",
    title: "Рабочая спецификация оснащения пилотного объекта v0.1",
    type: "instruction",
    location: "User instruction, 2026-08-01",
    publisher: "project owner",
    publication_date: "2026-08-01",
    accessed_at: "2026-08-01",
    reliability: "primary",
    notes: "Первичный источник рабочего состава оборудования; содержание имеет статус research и не включает цены, выбранные модели или итоговый CAPEX."
  });
  assert.deepEqual(decisions.find(item => item.id === "DEC-005"), {
    id: "DEC-005",
    title: "Зарегистрировать рабочую CAPEX-спецификацию v0.1 со статусом research",
    status: "approved",
    decision: "Создать и зарегистрировать CAPEX — Equipment Specification v0.1 как рабочий документ со статусом research, не утверждая перечисленное оборудование, цены, модели, финансовые показатели или итоговый CAPEX.",
    rationale: "Прямое задание владельца проекта от 2026-08-01 сохранить полную рабочую спецификацию без самостоятельного завершения отсутствующих разделов.",
    affected_documents: ["DOC-CAPEX-EQUIPMENT-SPECIFICATION"],
    approved_by: "project owner",
    approved_at: "2026-08-01",
    supersedes: null,
    source_ids: ["SRC-CAPEX-EQUIPMENT-SPEC-V0-1-BRIEF"],
    updated_at: "2026-08-01"
  });

  for (const dependencyId of ["DEP-FOUNDATION-DERIVED-DOCUMENTS", "DEP-BMA-DERIVED-DOCUMENTS"]) {
    const dependency = dependencies.find(item => item.id === dependencyId) as { target_documents: Array<Record<string, unknown>> };
    assert.deepEqual(
      dependency.target_documents.find(item => item.title === "CAPEX — Equipment Specification"),
      { title: "CAPEX — Equipment Specification", document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION" }
    );
  }
  assert.equal(decisionChange.change_id, "CHG-007");
  assert.equal(decisionChange.status, "approved");
  assert.equal(decisionChange.decision_id, "DEC-001");
  assert.equal(documentChange.change_id, "CHG-008");
  assert.equal(documentChange.status, "approved");
  assert.equal(documentChange.decision_id, "DEC-005");
});

test("working CAPEX registration is journaled", () => {
  const changelog = path.join(platform, "changelog");
  const files = fs.readdirSync(changelog);
  const log = fs.readFileSync(path.join(changelog, "changes.log"), "utf8");
  assert.equal(files.some(file => file.endsWith("-CHG-007.md")), true);
  assert.equal(files.some(file => file.endsWith("-CHG-008.md")), true);
  assert.match(log, / CHG-007 decision=DEC-001 touched=sources,decisions/);
  assert.match(log, / CHG-008 decision=DEC-005 touched=documents,dependencies,decisions/);
});
