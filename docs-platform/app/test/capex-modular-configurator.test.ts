import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { previewModularReverse } from "../src/capex/modular-workflow.js";
import {
  CAPEX_FORMAT_IDS,
  CAPEX_MODULE_IDS,
  buildEquipmentBom,
  modularPayloadHash,
  modularStatistics,
  readModularSources,
  validateModularSources,
  type ModularSources,
} from "../src/capex/modular.js";
import { CAPEX_REGISTER_SOURCE_SHA256, readRegister } from "../src/capex/register.js";
import { REMAINING_PRICE_DECISION_ID } from "../src/capex/remaining-price-workflow.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const register = readRegister();
const sources = readModularSources();
const clone = <T>(value: T): T => structuredClone(value);

function configured(formatId: typeof CAPEX_FORMAT_IDS[number], selectedModules: typeof CAPEX_MODULE_IDS[number][] = [], values: Record<string, unknown> = {}) {
  const result = clone(sources);
  result.configurations.configurations[0] = { ...result.configurations.configurations[0], format_id: formatId, selected_modules: selectedModules, excluded_modules: [], ...values };
  return result;
}

test("Equipment Register contains 160 records and formats are separate from equipment", () => {
  assert.equal(register.equipment.length, 160);
  assert.equal(register.document.source_record_count, 124);
  assert.equal(register.document.added_research_record_count, 36);
  assert.equal(register.document.equipment_record_count, 160);
  assert.equal(register.equipment.filter(item => item.item_id.startsWith("CAPEX-05-")).length, 27);
  for (const formatId of CAPEX_FORMAT_IDS) assert.equal(register.equipment.some(item => item.item_id === formatId), false);
});

test("module, item and format IDs are unique and all cross-references validate", () => {
  assert.deepEqual(sources.modules.modules.map(item => item.module_id), [...CAPEX_MODULE_IDS]);
  assert.deepEqual(sources.point_formats.formats.map(item => item.format_id), [...CAPEX_FORMAT_IDS]);
  assert.equal(new Set(sources.module_items.links.map(item => `${item.module_id}\u0000${item.item_id}`)).size, sources.module_items.links.length);
  assert.deepEqual(validateModularSources(register, sources), []);
  assert.deepEqual(modularStatistics(register, sources), {
    equipment_record_count: 160, module_count: 12, point_format_count: 7, configuration_count: 2,
    module_item_link_count: 162, mapped_equipment_record_count: 160, unmapped_record_count: 0,
  });
});

test("all configuration overrides reference existing configurations and items", () => {
  const configurationIds = new Set(sources.configurations.configurations.map(item => item.configuration_id));
  const itemIds = new Set(register.equipment.map(item => item.item_id));
  for (const override of sources.configuration_overrides.overrides) {
    assert.equal(configurationIds.has(override.configuration_id), true);
    assert.equal(itemIds.has(override.item_id), true);
  }
});

test("BOM deduplicates item_id and aggregation once counts an item one time", () => {
  const synthetic = configured("FMT-INTEGRATED");
  const original = synthetic.module_items.links.find(link => link.module_id === "MOD-PREP" && link.item_id === "CAPEX-01-001")!;
  synthetic.module_items.links.push({ ...original, module_id: "MOD-RETAIL-HOT" });
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, synthetic);
  assert.equal(bom.equipment.filter(item => item.item_id === "CAPEX-01-001").length, 1);
  assert.equal(bom.equipment.find(item => item.item_id === "CAPEX-01-001")?.calculated_quantity, 1);
  assert.equal(new Set(bom.equipment.map(item => item.item_id)).size, bom.equipment.length);
});

test("aggregation sum uses a defined driver and max chooses the highest active requirement", () => {
  const sumSources = configured("FMT-CUSTOM", ["MOD-GUEST"], { seat_count: 4 });
  const chair = sumSources.module_items.links.find(link => link.item_id === "CAPEX-05-002")!;
  chair.quantity_rule_value = 1;
  const sumBom = buildEquipmentBom("CFG-TEMPLATE-001", register, sumSources);
  assert.equal(sumBom.equipment.find(item => item.item_id === "CAPEX-05-002")?.calculated_quantity, 4);

  const maxBom = buildEquipmentBom("CFG-TEMPLATE-001", register, configured("FMT-INTEGRATED"));
  assert.equal(maxBom.equipment.find(item => item.item_id === "CAPEX-02-007")?.calculated_quantity, 1);
  assert.equal(maxBom.equipment.find(item => item.item_id === "CAPEX-02-008")?.calculated_quantity, 1);
});

test("included_in_parent remains visible but is never an independent procurement record", () => {
  const syntheticRegister = clone(register);
  const item = syntheticRegister.equipment.find(entry => entry.item_id === "CAPEX-01-044")!;
  item.inclusion_status = "included_in_parent";
  item.parent_item_id = "CAPEX-01-043";
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", syntheticRegister, configured("FMT-PREP-CENTER"));
  assert.equal(bom.equipment.find(entry => entry.item_id === "CAPEX-01-044")?.independent_procurement, false);
});

test("food court, street pickup and foodtruck omit guest seating by default", () => {
  for (const formatId of ["FMT-FOOD-COURT", "FMT-STREET-PICKUP", "FMT-FOODTRUCK"] as const) {
    const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, configured(formatId));
    assert.equal(bom.active_modules.some(item => item.module_id === "MOD-GUEST"), false, formatId);
    assert.equal(bom.equipment.some(item => item.item_id.startsWith("CAPEX-05-001") || item.item_id === "CAPEX-05-022"), false, formatId);
  }
  const foodtruck = buildEquipmentBom("CFG-TEMPLATE-001", register, configured("FMT-FOODTRUCK"));
  assert.equal(foodtruck.active_modules.some(item => item.module_id === "MOD-PREP"), false);
  assert.equal(foodtruck.equipment.some(item => item.item_id.startsWith("CAPEX-01-")), false);
});

test("integrated and custom formats compose modules without changing their base profiles", () => {
  const integratedSources = configured("FMT-INTEGRATED", ["MOD-GUEST", "MOD-BAR", "MOD-GROW"]);
  const integrated = buildEquipmentBom("CFG-TEMPLATE-001", register, integratedSources);
  for (const moduleId of ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-GUEST", "MOD-BAR", "MOD-GROW"]) assert.equal(integrated.active_modules.some(item => item.module_id === moduleId), true, moduleId);
  const baseIntegrated = sources.point_formats.formats.find(item => item.format_id === "FMT-INTEGRATED")!;
  assert.equal(baseIntegrated.optional_modules.includes("MOD-GUEST"), true);

  const custom = buildEquipmentBom("CFG-TEMPLATE-001", register, configured("FMT-CUSTOM", ["MOD-GUEST"]));
  assert.deepEqual(custom.active_modules.map(item => item.module_id), ["MOD-GUEST"]);
  assert.equal(custom.equipment.every(item => item.item_id.startsWith("CAPEX-05-")), true);
});

test("unknown coefficients leave quantities blank and explicitly require clarification", () => {
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, configured("FMT-CUSTOM", ["MOD-GUEST"], { seat_count: 20, guest_area_m2: 50 }));
  const chair = bom.equipment.find(item => item.item_id === "CAPEX-05-002")!;
  assert.equal(chair.calculated_quantity, null);
  assert.equal(chair.calculation_status, "Требует уточнения");
  assert.notEqual(chair.calculated_quantity, 0);
});

test("configuration overrides change only the generated BOM", () => {
  const synthetic = configured("FMT-CUSTOM", ["MOD-GUEST"]);
  synthetic.configuration_overrides.overrides.push({
    configuration_id: "CFG-TEMPLATE-001", item_id: "CAPEX-05-001", action: "exclude", quantity_override: null,
    specification_override: null, requirement_override: null, reason: "test override", lifecycle_status: "research", notes: null,
  });
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, synthetic);
  assert.equal(bom.equipment.some(item => item.item_id === "CAPEX-05-001"), false);
  assert.equal(register.equipment.some(item => item.item_id === "CAPEX-05-001"), true);
  assert.equal(sources.point_formats.formats.find(item => item.format_id === "FMT-CUSTOM")?.required_modules.length, 0);
});

test("the empty template configuration produces an empty BOM without fabricated values", () => {
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, sources);
  assert.equal(bom.document.format_id, "FMT-CUSTOM");
  assert.deepEqual(bom.active_modules, []);
  assert.deepEqual(bom.equipment, []);
  const configuration = sources.configurations.configurations[0];
  for (const value of [configuration.total_area_m2, configuration.guest_area_m2, configuration.hall_count, configuration.seat_count, configuration.cashier_post_count, configuration.hot_kitchen_post_count, configuration.filling_count, configuration.service_station_count]) assert.equal(value, null);
});

test("numeric fields contain no tbd and preliminary prices do not alter CAPEX-05 or approve a final CAPEX", () => {
  for (const item of register.equipment) {
    for (const field of ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max"] as const) assert.equal(typeof item[field] === "string", false, `${item.item_id}.${field}`);
  }
  assert.equal(register.equipment.filter(item => item.price_base !== null).length, 51);
  assert.equal(register.equipment.filter(item => item.item_id.startsWith("CAPEX-05-")).every(item => item.price_min === null && item.price_base === null && item.price_max === null && item.supplier === null), true);
  assert.doesNotMatch(fs.readFileSync(path.join(platform, "working", "capex-equipment-register.yaml"), "utf8"), /итоговый CAPEX:\s*\d/i);
});

test("approved payload hash is exact and source CAPEX Markdown remains unchanged", () => {
  const payloadPath = path.join(platform, "changelog", "payloads", "ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01-approved.yaml");
  const payloadHash = crypto.createHash("sha256").update(fs.readFileSync(payloadPath)).digest("hex");
  assert.equal(payloadHash, "73f5a811214f548ba3c8e1cde8e16317e5bbc3b98cf3f5ecc67c4c12ffdb6453");
  const source = fs.readFileSync(path.join(platform, "working", "capex-equipment-specification.md"));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), CAPEX_REGISTER_SOURCE_SHA256);
  const payload = YAML.parse(fs.readFileSync(payloadPath, "utf8"));
  const historicalSources = {
    modules: payload.modules,
    module_items: payload.module_items,
    point_formats: payload.point_formats,
    configurations: payload.configurations,
    configuration_overrides: payload.configuration_overrides,
  } as ModularSources;
  assert.equal(modularPayloadHash(payload.equipment_register, historicalSources), payloadHash);
  assert.equal(payload.equipment_register.document.decision_id, "DEC-008");
  assert.equal(payload.equipment_register.equipment.every((item: { price_base: number | null }) => item.price_base === null), true);
  assert.equal(register.document.decision_id, REMAINING_PRICE_DECISION_ID);
});

test("pilot configuration includes one deduplicated wash system and the approved optional modules", () => {
  const bom = buildEquipmentBom("CFG-PILOT-001", register, sources);
  assert.equal(bom.equipment.filter(item => item.item_id === "CAPEX-08-001").length, 1);
  assert.equal(bom.equipment.find(item => item.item_id === "CAPEX-08-001")?.calculated_quantity, 1);
  for (const moduleId of ["MOD-GUEST", "MOD-BAR", "MOD-STAFF", "MOD-WASH"]) assert.equal(bom.active_modules.some(item => item.module_id === moduleId), true, moduleId);
  assert.equal(bom.active_modules.some(item => item.module_id === "MOD-GROW"), false);
});

test("governed reverse preview restores the original composite hash without Git reset", () => {
  const receipt = path.join(platform, "changelog", "iteration-receipts", "ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01.yaml");
  const preview = previewModularReverse(receipt, "CHG-ROLLBACK-TEST", "DEC-ROLLBACK-TEST");
  assert.equal(preview.restores_original_hash, true);
  assert.equal(preview.apply_allowed, false);
  assert.equal(preview.reverse_change_set.status, "proposed");
  assert.equal(preview.reverse_change_set.operations.filter(operation => operation.type === "restore_file").length, 2);
  for (const operation of preview.reverse_change_set.operations.filter(operation => operation.type === "restore_file")) {
    assert.match(operation.source ?? "", /^docs-platform\/changelog\/rollback-payloads\//);
    assert.equal(fs.existsSync(path.resolve(platform, "..", operation.source!)), true);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.resolve(platform, "..", operation.source!))).digest("hex"), operation.expected_sha256);
  }
  assert.doesNotMatch(preview.instruction, /git reset/i);
});

test("modular sources, receipts and logs contain no secret-shaped keys", () => {
  const files = [
    "working/capex-modules.yaml", "working/capex-module-items.yaml", "working/capex-point-formats.yaml", "working/capex-configurations.yaml",
    "working/capex-configuration-overrides.yaml", "changelog/iteration-receipts/ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01.yaml",
  ];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(platform, file), "utf8"), /refresh_token|client_secret|access_token/i, file);
});
