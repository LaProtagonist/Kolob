import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildEquipmentBom, readModularSources } from "../src/capex/modular.js";
import { readPriceResearch, type PriceScenario } from "../src/capex/price-research.js";
import {
  REMAINING_PRICE_PAYLOAD_PATH,
  previewRemainingPriceReverse,
} from "../src/capex/remaining-price-workflow.js";
import { readRegister } from "../src/capex/register.js";
import { buildCapexRows, capexData, emptyCapexParameters, summarizeEquipment } from "../../../src/lib/capex-runtime.js";
import { calculateLaunchBudget, defaultLaunchBudgetState } from "../../../src/lib/launch-budget.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");
const register = readRegister();
const research = readPriceResearch();
const modular = readModularSources();
const scenarios: PriceScenario[] = ["minimum", "base", "scale_ready"];
const itemIds = [
  "CAPEX-01-001", "CAPEX-01-002", "CAPEX-01-012", "CAPEX-02-001",
  "CAPEX-02-002", "CAPEX-02-003", "CAPEX-02-054", "CAPEX-02-055",
] as const;

const exact = {
  "CAPEX-01-001": { name: "Холодильная камера", quantities: [1, 1, 1], units: [263919, 328655, 358788], totals: [263919, 328655, 358788] },
  "CAPEX-01-002": { name: "Морозильная камера", quantities: [1, 1, 1], units: [307521, 429679, 465090], totals: [307521, 429679, 465090] },
  "CAPEX-01-012": { name: "Вытяжной зонт или система вытяжных зонтов", quantities: [1, 1, 1], units: [32909, 75172, 93669], totals: [32909, 75172, 93669] },
  "CAPEX-02-001": { name: "Газовый гриль для колобков", quantities: [2, 2, 2], units: [30000, 45000, 60000], totals: [60000, 90000, 120000] },
  "CAPEX-02-002": { name: "Гриль для Манчеса", quantities: [3, 3, 4], units: [16500, 20000, 25000], totals: [49500, 60000, 100000] },
  "CAPEX-02-003": { name: "Профессиональные ручные шприцы или пистолеты-дозаторы", quantities: [24, 24, 24], units: [10000, 10000, 10000], totals: [240000, 240000, 240000] },
  "CAPEX-02-054": { name: "Стеллажи или держатели для бутылок", quantities: [1, 2, 3], units: [15299, 15299, 15299], totals: [15299, 30598, 45897] },
  "CAPEX-02-055": { name: "Закрываемая зона хранения алкогольной продукции", quantities: [1, 1, 1], units: [58443, 83284, 116874], totals: [58443, 83284, 116874] },
} as const;

test("all eight approved items have exact research prices and remain quote_required", () => {
  assert.equal(register.equipment.filter(item => !item.composition_profile).length, 160);
  assert.equal(research.items.filter(item => !register.equipment.find(row => row.item_id === item.item_id)?.composition_profile && item.valuation_status === "priced").length, 51);
  assert.equal(research.items.filter(item => !register.equipment.find(row => row.item_id === item.item_id)?.composition_profile && item.valuation_status !== "priced").length, 0);
  for (const itemId of itemIds) {
    const source = research.items.find(item => item.item_id === itemId)!;
    const item = register.equipment.find(entry => entry.item_id === itemId)!;
    const expected = exact[itemId];
    assert.equal(item.name, expected.name, itemId);
    assert.equal(source.valuation_status, "priced", itemId);
    assert.equal(source.quote_status, "quote_required", itemId);
    assert.equal(item.quote_status, "quote_required", itemId);
    assert.deepEqual(scenarios.map(scenario => source.scenarios[scenario]?.quantity), [...expected.quantities], itemId);
    assert.deepEqual(scenarios.map(scenario => source.scenarios[scenario]?.observed_unit_price_rub), [...expected.units], itemId);
    assert.deepEqual(scenarios.map(scenario => source.scenarios[scenario]?.line_total_rub), [...expected.totals], itemId);
    assert.deepEqual([item.price_min, item.price_base, item.price_max], [...expected.units], itemId);
  }
});

test("gas grill nomenclature is exact and its owner-approved estimate has no fabricated URL", () => {
  const gas = research.items.find(item => item.item_id === "CAPEX-02-001")!;
  assert.equal(register.equipment.find(item => item.item_id === gas.item_id)?.name, "Газовый гриль для колобков");
  assert.doesNotMatch(register.equipment.find(item => item.item_id === gas.item_id)!.name, /такояки/i);
  for (const scenario of scenarios) {
    assert.equal(gas.scenarios[scenario]?.source_url, null);
    assert.equal(gas.scenarios[scenario]?.source_type, "owner_approved_research_estimate");
    assert.equal(gas.scenarios[scenario]?.source_location, REMAINING_PRICE_PAYLOAD_PATH);
  }
});

test("all source IDs exist and gas-grill source records point to the approved payload", () => {
  const sourceRegistry = YAML.parse(fs.readFileSync(path.join(platform, "registry", "sources.yaml"), "utf8")).sources as Array<{ id: string; location: string; type: string }>;
  const byId = new Map(sourceRegistry.map(source => [source.id, source]));
  for (const itemId of itemIds) {
    const item = research.items.find(entry => entry.item_id === itemId)!;
    for (const scenario of scenarios) {
      const source = byId.get(item.scenarios[scenario]!.source_id);
      assert.ok(source, `${itemId}.${scenario}`);
      if (itemId === "CAPEX-02-001") {
        assert.equal(source!.location, REMAINING_PRICE_PAYLOAD_PATH);
        assert.equal(source!.type, "owner_approved_research_estimate");
      }
    }
  }
});

test("BAR alcohol equipment follows alcohol_enabled exactly in canonical BOM and web runtime", () => {
  const links = modular.module_items.links.filter(link => ["CAPEX-02-054", "CAPEX-02-055"].includes(link.item_id));
  assert.equal(links.length, 2);
  assert.equal(links.every(link => link.module_id === "MOD-BAR" && link.condition === "alcohol_enabled == true"), true);

  const withoutAlcohol = structuredClone(modular);
  const configuration = withoutAlcohol.configurations.configurations.find(item => item.configuration_id === "CFG-TEMPLATE-001")!;
  Object.assign(configuration, { format_id: "FMT-CUSTOM", selected_modules: ["MOD-BAR"], excluded_modules: [], bar_enabled: true, alcohol_enabled: false });
  const soberBom = buildEquipmentBom("CFG-TEMPLATE-001", register, withoutAlcohol);
  assert.equal(soberBom.equipment.some(item => ["CAPEX-02-054", "CAPEX-02-055"].includes(item.item_id)), false);
  configuration.alcohol_enabled = true;
  const alcoholBom = buildEquipmentBom("CFG-TEMPLATE-001", register, withoutAlcohol);
  assert.deepEqual(alcoholBom.equipment.filter(item => ["CAPEX-02-054", "CAPEX-02-055"].includes(item.item_id)).map(item => item.item_id), ["CAPEX-02-054", "CAPEX-02-055"]);

  const active = new Set(["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR"]);
  const soberRows = buildCapexRows(active, "base", emptyCapexParameters({ alcoholEnabled: false }));
  const alcoholRows = buildCapexRows(active, "base", emptyCapexParameters({ alcoholEnabled: true }));
  assert.deepEqual(soberRows.filter(row => itemIds.includes(row.item.id as typeof itemIds[number])).map(row => row.item.id), [...itemIds].slice(0, 6));
  assert.deepEqual(alcoholRows.filter(row => itemIds.includes(row.item.id as typeof itemIds[number])).map(row => row.item.id), [...itemIds]);
});

test("launch-budget excludes the priced hood exactly once while the configurator keeps it visible", () => {
  const rows = buildCapexRows(new Set(["MOD-PREP"]), "base", emptyCapexParameters());
  const hood = rows.find(row => row.item.id === "CAPEX-01-012")!;
  assert.equal(hood.lineTotal, 75172);
  assert.equal(summarizeEquipment(rows).rows.some(row => row.item.id === hood.item.id), true);
  const launchSummary = summarizeEquipment(rows, [], ["CAPEX-01-012"]);
  assert.equal(launchSummary.rows.some(row => row.item.id === hood.item.id), false);
  assert.equal(summarizeEquipment(rows).total - launchSummary.total, 75172);
  assert.equal(calculateLaunchBudget(defaultLaunchBudgetState()).equipment.rows.some(row => row.item.id === "CAPEX-01-012"), false);
});

test("seating labels and full accessible labels come from the current structured snapshot", () => {
  assert.deepEqual(capexData.investorStartModel.seating.profiles.map(profile => [profile.label, profile.aria_label]), [
    ["Плотная", "Плотная посадка — 1,4 м² на место"],
    ["Сбалансированная", "Сбалансированная посадка — 1,6 м² на место"],
    ["Комфортная", "Комфортная посадка — 1,8 м² на место"],
  ]);
});

test("current reverse preview restores the captured before hashes without applying or using git reset", () => {
  const original = console.log;
  console.log = () => undefined;
  try {
    const preview = previewRemainingPriceReverse(undefined, "CHG-ROLLBACK-CAPEX-REMAINING-TEST", "DEC-ROLLBACK-CAPEX-REMAINING-TEST");
    assert.equal(preview.restores_original_hash, true);
    assert.equal(preview.apply_allowed, false);
    assert.equal(preview.history_preserved, true);
    assert.equal(preview.git_reset_used, false);
  } finally {
    console.log = original;
  }
});

test("new approved prices are absent from React components and remain sourced from the snapshot", () => {
  const components = ["src/components/CapexConfigurator.tsx", "src/components/LaunchBudget.tsx"].map(file => fs.readFileSync(path.join(project, file), "utf8")).join("\n");
  assert.doesNotMatch(components, /263919|328655|358788|307521|429679|465090|240000|116874/);
  assert.match(fs.readFileSync(path.join(project, "src", "lib", "capex-runtime.ts"), "utf8"), /capex-configurator-data\.json/);
});
