import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  buildRegister,
  CAPEX_REGISTER_SOURCE_SHA256,
  equipmentCsv,
  EQUIPMENT_COLUMNS,
  readRegister,
  registerStatistics,
  serializeRegister,
  validateRegister,
} from "../src/capex/register.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(platform, "working", "capex-equipment-specification.md");
const yamlPath = path.join(platform, "working", "capex-equipment-register.yaml");
const csvPath = path.join(platform, "working", "capex-equipment-register.csv");
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

test("all 124 source records are mapped once to stable IDs without changing the source", () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const register = buildRegister(source);
  const expectedIds = [
    ...Array.from({ length: 47 }, (_, index) => `CAPEX-01-${String(index + 1).padStart(3, "0")}`),
    ...Array.from({ length: 55 }, (_, index) => `CAPEX-02-${String(index + 1).padStart(3, "0")}`),
    ...Array.from({ length: 19 }, (_, index) => `CAPEX-03-${String(index + 1).padStart(3, "0")}`),
    ...Array.from({ length: 3 }, (_, index) => `CAPEX-04-${String(index + 1).padStart(3, "0")}`),
  ];
  assert.equal(sha256(source), CAPEX_REGISTER_SOURCE_SHA256);
  assert.equal(register.document.source_record_count, 124);
  assert.equal(register.document.mapped_record_count, 124);
  assert.equal(register.document.unmapped_record_count, 0);
  assert.deepEqual(register.equipment.map(item => item.item_id), expectedIds);
  assert.equal(new Set(register.equipment.map(item => item.item_id)).size, 124);
});

test("canonical YAML passes schema and reference validation and CSV is generated only from it", () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const register = readRegister();
  assert.deepEqual(validateRegister(register, source), []);
  assert.equal(fs.readFileSync(yamlPath, "utf8"), serializeRegister(register));
  assert.equal(fs.readFileSync(csvPath, "utf8"), equipmentCsv(register));
  assert.equal(fs.readFileSync(csvPath, "utf8").trimEnd().split("\n").length, 125);
  assert.equal(fs.readFileSync(csvPath, "utf8").split("\n", 1)[0], EQUIPMENT_COLUMNS.join(","));
});

test("parent references, inclusion and numerical uncertainty rules prevent double counting", () => {
  const register = readRegister();
  const ids = new Set(register.equipment.map(item => item.item_id));
  const numericFields = ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max"] as const;
  for (const item of register.equipment) {
    if (item.parent_item_id) assert.equal(ids.has(item.parent_item_id), true, item.item_id);
    if (item.inclusion_status === "included_in_parent") {
      assert.notEqual(item.parent_item_id, null);
      assert.equal(["standalone", "purchased_separately"].includes(item.inclusion_status), false);
    }
    for (const field of numericFields) assert.equal(typeof item[field] === "string", false, `${item.item_id}.${field}`);
    if ([item.price_min, item.price_base, item.price_max].some(value => value !== null)) {
      assert.notEqual(item.source_id, null);
      assert.notEqual(item.price_date, null);
    }
    assert.equal(item.lifecycle_status, "research");
  }
  assert.equal(register.equipment.every(item => item.price_min === null && item.price_base === null && item.price_max === null), true);
  assert.equal(register.equipment.every(item => item.supplier === null), true);
  const baseline = registerStatistics(register).main_procurement_records;
  const synthetic = structuredClone(register);
  const candidate = synthetic.equipment.find(item => item.inclusion_status === "standalone" && !["open_question", "engineering_connection"].includes(item.record_type))!;
  candidate.inclusion_status = "included_in_parent";
  candidate.parent_item_id = synthetic.equipment.find(item => item.item_id !== candidate.item_id)!.item_id;
  assert.equal(registerStatistics(synthetic).main_procurement_records, baseline - 1);
});

test("open parameters and missing sections preserve explicit source boundaries", () => {
  const register = readRegister();
  const global = register.open_parameters.filter(parameter => parameter.item_id === null);
  assert.equal(global.length, 15);
  assert.deepEqual(global.map(parameter => parameter.parameter), [
    "конкретные производители и модели", "производительность оборудования", "окончательное количество су-видов",
    "необходимость отдельной мясорубки", "выбор между ледяным охлаждением и шоковым охлаждением",
    "производительность льдогенератора", "размеры и количество гастроёмкостей", "количество и объём кег",
    "конфигурация post-mix", "параметры пароконвектоматов", "параметры вытяжки", "параметры KDS и POS",
    "инженерный расчёт модуля выращивания", "резервные единицы оборудования", "запасные части и расходные компоненты",
  ]);
  assert.equal(register.missing_sections.length, 27);
  assert.equal(register.missing_sections.every(section => section.status === "not_started"), true);
  assert.equal(register.missing_sections[0].section_id, "CAPEX-05");
  assert.equal(register.missing_sections.at(-1)?.section_id, "CAPEX-31");
});

test("register statistics distinguish source records from independent procurement records", () => {
  const statistics = registerStatistics(readRegister());
  assert.deepEqual(statistics, {
    source_record_count: 124,
    mapped_record_count: 124,
    unmapped_record_count: 0,
    main_procurement_records: 47,
    by_record_type: {
      equipment: 30, system: 6, component: 14, accessory: 4, inventory: 56, furniture: 11,
      engineering_connection: 1, installation_service: 0, consumable: 0, software: 0, open_question: 2,
    },
    inclusion_status_tbd: 77,
    quantity_base_tbd: 99,
    open_parameter_count: 158,
    missing_section_count: 27,
  });
});

test("registry, decision, dependencies, governed payload and Google receipt identify one research register", () => {
  const readYaml = <T>(relative: string) => YAML.parse(fs.readFileSync(path.join(platform, relative), "utf8")) as T;
  const documents = readYaml<{ documents: Array<Record<string, unknown>> }>("registry/documents.yaml").documents;
  const dependencies = readYaml<{ dependencies: Array<{ id: string; source_document_id: string; target_documents: Array<{ document_id: string | null }> }> }>("registry/dependencies.yaml").dependencies;
  const decisions = readYaml<{ decisions: Array<{ id: string; affected_documents: string[]; status: string }> }>("registry/decisions.yaml").decisions;
  const change = readYaml<{ change_id: string; decision_id: string; approved_payload_sha256: string; status: string }>("changes/CHG-012-capex-equipment-register-v0-1.yaml");
  const receipt = readYaml<{ registry_id: string; source_status: string; source_record_count: number; mapped_record_count: number; unmapped_record_count: number; readback: string; sheets: string[] }>("changelog/google-sync/2026-08-01-DOC-CAPEX-EQUIPMENT-REGISTER.yaml");
  assert.deepEqual(documents.find(item => item.id === "DOC-CAPEX-EQUIPMENT-REGISTER"), {
    id: "DOC-CAPEX-EQUIPMENT-REGISTER", title: "CAPEX Equipment Register", type: "working_capex_equipment_register",
    status: "research", google_file_id: "1J7sHM8P2IoMfHVLEHfY-UJLIZ-HBid89G6n6BS4BSJA", template: null,
    sections: ["README", "EQUIPMENT", "OPEN_PARAMETERS", "MISSING_SECTIONS", "DICTIONARIES"], version: "0.1",
    local_path: "docs-platform/working/capex-equipment-register.yaml", updated_at: "2026-08-01",
  });
  assert.deepEqual(dependencies.find(item => item.id === "DEP-CAPEX-SPEC-EQUIPMENT-REGISTER"), {
    id: "DEP-CAPEX-SPEC-EQUIPMENT-REGISTER", source_document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION", priority: "governing_source",
    status: "approved", version: "0.1", target_documents: [{ title: "CAPEX Equipment Register", document_id: "DOC-CAPEX-EQUIPMENT-REGISTER" }], updated_at: "2026-08-01",
  });
  assert.equal(dependencies.find(item => item.id === "DEP-CAPEX-REGISTER-DERIVED-DOCUMENTS")?.target_documents[0].document_id, null);
  assert.deepEqual(decisions.find(item => item.id === "DEC-007"), { ...decisions.find(item => item.id === "DEC-007")!, status: "approved", affected_documents: ["DOC-CAPEX-EQUIPMENT-SPECIFICATION", "DOC-CAPEX-EQUIPMENT-REGISTER"] });
  assert.equal(change.change_id, "CHG-012");
  assert.equal(change.decision_id, "DEC-007");
  assert.equal(change.approved_payload_sha256, "75698b54ff3819449239a62d535bf84c3ddb30a64b7b6a92076ee2f706775dec");
  assert.equal(change.status, "approved");
  assert.deepEqual({ id: receipt.registry_id, status: receipt.source_status, source: receipt.source_record_count, mapped: receipt.mapped_record_count, unmapped: receipt.unmapped_record_count, readback: receipt.readback, sheets: receipt.sheets }, {
    id: "DOC-CAPEX-EQUIPMENT-REGISTER", status: "research", source: 124, mapped: 124, unmapped: 0, readback: "passed",
    sheets: ["README", "EQUIPMENT", "OPEN_PARAMETERS", "MISSING_SECTIONS", "DICTIONARIES"],
  });
});
