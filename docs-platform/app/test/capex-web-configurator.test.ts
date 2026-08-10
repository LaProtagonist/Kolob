import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  PILOT_CHANGE_ID,
  PILOT_DECISION_ID,
  PILOT_PAYLOAD_PATH,
  PILOT_RECEIPT_PATH,
  previewPilotReverse,
} from "../src/capex/pilot-expansion-workflow.js";
import { buildEquipmentBom, readModularSources } from "../src/capex/modular.js";
import { buildContentStateManifest, sourceHashMap } from "../src/capex/content-state.js";
import { PRICE_SCENARIOS, readPriceResearch } from "../src/capex/price-research.js";
import { REMAINING_PRICE_DECISION_ID } from "../src/capex/remaining-price-workflow.js";
import { CAPEX_REGISTER_SOURCE_SHA256, readRegister, sha256 } from "../src/capex/register.js";
import { buildWebSnapshot, checkWebSnapshot, WEB_SNAPSHOT_PATH } from "../src/capex/web-snapshot.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");
const register = readRegister();
const research = readPriceResearch();
const modular = readModularSources();

function configured(formatId: string) {
  const sources = structuredClone(modular);
  sources.configurations.configurations[0] = {
    ...sources.configurations.configurations[0],
    format_id: formatId as typeof sources.configurations.configurations[0]["format_id"],
    selected_modules: [],
    excluded_modules: [],
  };
  return sources;
}

test("CAPEX-01-009 is one unit in the register, MOD-PREP rule and every research scenario", () => {
  const oven = register.equipment.find(item => item.item_id === "CAPEX-01-009")!;
  const link = modular.module_items.links.find(item => item.module_id === "MOD-PREP" && item.item_id === oven.item_id)!;
  const price = research.items.find(item => item.item_id === oven.item_id)!;
  assert.equal(register.document.decision_id, REMAINING_PRICE_DECISION_ID);
  assert.deepEqual([oven.quantity_min, oven.quantity_base, oven.quantity_scale_ready], [1, 1, 1]);
  assert.deepEqual([link.quantity_rule_type, link.quantity_rule_value, link.aggregation_rule], ["fixed", 1, "once"]);
  assert.deepEqual(PRICE_SCENARIOS.map(scenario => price.scenarios[scenario]?.quantity), [1, 1, 1]);
  assert.deepEqual(PRICE_SCENARIOS.map(scenario => price.scenarios[scenario]?.line_total_rub), [300372, 436564, 596030]);
});

test("formats without MOD-PREP omit the oven and intersections count it once", () => {
  for (const formatId of ["FMT-FOOD-COURT", "FMT-STREET-PICKUP", "FMT-FOODTRUCK"] as const) {
    const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, configured(formatId));
    assert.equal(bom.active_modules.some(module => module.module_id === "MOD-PREP"), false, formatId);
    assert.equal(bom.equipment.some(item => item.item_id === "CAPEX-01-009"), false, formatId);
  }
  const integratedSources = configured("FMT-INTEGRATED");
  const originalLink = integratedSources.module_items.links.find(item => item.item_id === "CAPEX-01-009")!;
  integratedSources.module_items.links.push({ ...originalLink, module_id: "MOD-RETAIL-HOT" });
  const integrated = buildEquipmentBom("CFG-TEMPLATE-001", register, integratedSources);
  assert.equal(integrated.equipment.filter(item => item.item_id === "CAPEX-01-009").length, 1);
  assert.equal(integrated.equipment.find(item => item.item_id === "CAPEX-01-009")?.calculated_quantity, 1);
});

test("scenario totals are recalculated from line items and all eligible records now have research prices", () => {
  for (const scenario of PRICE_SCENARIOS) {
    const calculated = research.items.reduce((sum, item) => sum + (item.scenarios[scenario]?.line_total_rub ?? 0), 0);
    assert.equal(Math.round(calculated * 100) / 100, research.summary.totals_rub[scenario]);
  }
  assert.deepEqual(research.summary.totals_rub, { minimum: 4085990.33, base: 5488047.33, scale_ready: 6915980.79 });
  const unpriced = research.items.filter(item => item.valuation_status !== "priced");
  assert.equal(unpriced.length, research.summary.unpriced_record_count);
  assert.equal(unpriced.length, 0);
  assert.equal(unpriced.every(item => PRICE_SCENARIOS.every(scenario => item.scenarios[scenario] === null)), true);
  assert.equal(register.equipment.filter(item => item.inclusion_status === "included_in_parent").every(item => item.price_base === null), true);
});

test("the web snapshot is deterministic, current and derived from canonical source hashes", () => {
  const built = buildWebSnapshot();
  const stored = JSON.parse(fs.readFileSync(WEB_SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(stored, built);
  assert.equal(built.meta.counts.equipmentRecords, 160);
  assert.equal(built.meta.counts.formats, 7);
  assert.equal(built.meta.counts.pricedRecords, research.summary.priced_record_count);
  assert.equal(built.meta.counts.foodPriceScopeRecords, research.summary.eligible_procurement_record_count);
  assert.equal(built.meta.decisionId, REMAINING_PRICE_DECISION_ID);
  assert.equal(built.items.find(item => item.id === "CAPEX-01-009")?.scenarios.base?.quantity, 1);
  assert.equal(built.scenarios.find(item => item.id === "minimum")?.availableInSelector, false);
  assert.equal(built.pilotConfiguration?.configuration_id, "CFG-PILOT-001");
  assert.equal(built.pilotEconomics.software.amount_rub_per_year, 120000);
  const contentState = buildContentStateManifest(project);
  assert.deepEqual(built.meta.contentState, contentState);
  assert.deepEqual(built.meta.sourceHashes, sourceHashMap(contentState));
  assert.equal(built.meta.contentStateSha256, contentState.content_state_sha256);
  assert.equal(Object.keys(built.meta.sourceHashes).some(relative => /events|decisions/.test(relative)), false);
  const original = console.log;
  console.log = () => undefined;
  try { assert.equal(checkWebSnapshot().validation, "OK"); }
  finally { console.log = original; }
});

test("the React page contains no manually duplicated register or hardcoded coverage totals", () => {
  const component = fs.readFileSync(path.join(project, "src", "components", "CapexConfigurator.tsx"), "utf8");
  const runtime = fs.readFileSync(path.join(project, "src", "lib", "capex-runtime.ts"), "utf8");
  assert.match(component, /capex-runtime/);
  assert.match(runtime, /capex-configurator-data\.json/);
  assert.doesNotMatch(component, /(?:pricedRecords|equipmentRecords|foodPriceScopeRecords)\s*[:=]\s*(?:43|51|160)/);
  assert.doesNotMatch(component, /CAPEX-01-009[^\n]{0,120}(?:300372|436564|596030)/);
  assert.doesNotMatch(component, /const\s+(?:equipment|items|formats|modules)\s*=\s*\[/i);
});

test("historical pilot payload remains exact and its reverse preview detects later governed changes", () => {
  const payloadFile = path.join(project, PILOT_PAYLOAD_PATH);
  const receiptFile = path.join(project, PILOT_RECEIPT_PATH);
  const payloadText = fs.readFileSync(payloadFile, "utf8");
  const payload = YAML.parse(payloadText);
  const change = YAML.parse(fs.readFileSync(path.join(platform, "changes", `${PILOT_CHANGE_ID}-pilot-capex-baseline.yaml`), "utf8"));
  const receipt = YAML.parse(fs.readFileSync(receiptFile, "utf8"));
  assert.equal(payload.decision_id, PILOT_DECISION_ID);
  assert.equal(change.change_id, PILOT_CHANGE_ID);
  assert.equal(change.decision_id, PILOT_DECISION_ID);
  assert.equal(receipt.approved_payload.sha256, sha256(payloadText));
  assert.equal(receipt.after_files.every((entry: { path: string; sha256: string }) => sha256(fs.readFileSync(path.join(project, entry.path))) === entry.sha256), false);
  const original = console.log;
  console.log = () => undefined;
  try {
    const reverse = previewPilotReverse(receiptFile, "CHG-ROLLBACK-WEB-TEST", "DEC-ROLLBACK-WEB-TEST");
    assert.equal(reverse.current_hash === reverse.expected_current_hash, false);
    assert.equal(reverse.restores_original_hash, true);
    assert.equal(reverse.apply_allowed, false);
    assert.equal(reverse.reverse_change_set.status, "proposed");
    assert.equal(reverse.reverse_change_set.rollback_of, PILOT_CHANGE_ID);
    assert.equal(reverse.reverse_change_set.operations.length, 9);
  } finally {
    console.log = original;
  }
});

test("source CAPEX Specification v0.1 remains byte-identical", () => {
  const source = fs.readFileSync(path.join(platform, "working", "capex-equipment-specification.md"));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), CAPEX_REGISTER_SOURCE_SHA256);
});
