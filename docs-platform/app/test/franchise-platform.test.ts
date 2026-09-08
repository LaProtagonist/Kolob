import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");

function yaml<T>(relativePath: string): T {
  return YAML.parse(fs.readFileSync(path.join(project, relativePath), "utf8")) as T;
}

test("Franchise Platform is registered as proposed/research architecture without changing governing documents", () => {
  const documents = yaml<{ documents: Array<Record<string, unknown>> }>("docs-platform/registry/documents.yaml").documents;
  const decisions = yaml<{ decisions: Array<Record<string, unknown>> }>("docs-platform/registry/decisions.yaml").decisions;
  const dependencies = yaml<{ dependencies: Array<Record<string, unknown>> }>("docs-platform/registry/dependencies.yaml").dependencies;
  const strategy = fs.readFileSync(path.join(project, "docs-platform/02-franchise-platform-strategy.md"), "utf8");

  assert.equal(documents.find(item => item.id === "DOC-FRANCHISE-PLATFORM-STRATEGY")?.status, "proposed");
  assert.equal(documents.find(item => item.id === "DOC-SCENARIO-PETROGRADKA-READY-PRODUCTION-BASE")?.status, "research");
  assert.equal(decisions.find(item => item.id === "DEC-FRANCHISE-PLATFORM-STRATEGY-2026-09-07-01")?.status, "approved");
  assert.equal(dependencies.find(item => item.id === "DEP-FOUNDATION-FRANCHISE-PLATFORM-STRATEGY")?.source_document_id, "DOC-FOUNDATION");
  assert.equal(dependencies.find(item => item.id === "DEP-BMA-FRANCHISE-PLATFORM-STRATEGY")?.source_document_id, "DOC-BUSINESS-MODEL-ARCHITECTURE");
  assert.match(strategy, /Foundation v1\.0 и Business Model Architecture v1\.0 остаются управляющими источниками/i);
  assert.match(strategy, /утверждённые блоки не изменяются/i);
  assert.match(strategy, /READY_PRODUCTION_BASE/);
  assert.match(strategy, /CUSTOM_PRODUCTION_BASE/);
  assert.match(strategy, /OWNED_PRODUCTION_BASE/);
});

test("Petrogradka remains a non-baseline research scenario with confirmation-gated equipment", () => {
  const scenario = yaml<any>("docs-platform/scenarios/petrogradka-ready-production-base.yaml");
  assert.equal(scenario.document.status, "research");
  assert.equal(scenario.document.scenario_profile, "READY_PRODUCTION_BASE");
  assert.match(scenario.document.boundary, /Не является baseline/);
  assert.equal(scenario.equipment.status, "available_subject_to_confirmation");
  assert.equal(scenario.premises.equipment_retention_status, "available_subject_to_confirmation");
  assert.ok(scenario.equipment.items.includes("Пароконвектомат Rational + 20 гастроёмкостей"));
  assert.equal(scenario.scenario_assumptions.second_combi_oven.status, "excluded");
  assert.deepEqual(scenario.capex.infrastructure_base_without_trading_point.excludes, ["rent", "deposit", "payroll", "inventory", "trading_hall", "individual_trading_points"]);
});

test("Franchise financial layer declares inputs and does not calculate a result without them", () => {
  const layer = yaml<any>("docs-platform/working/franchise-platform-parameters.yaml");
  const ids = layer.parameters.map((item: { id: string }) => item.id);
  assert.equal(layer.integration_contract.canonical_financial_model, "docs-platform/working/financial-model.yaml");
  assert.equal(layer.integration_contract.calculation_status, "blocked_by_missing_inputs");
  assert.deepEqual(ids, [
    "central_production_capacity", "franchise_unit_count", "own_unit_count", "franchise_entry_fee", "royalty_rate",
    "transfer_price_by_sku", "production_utilization", "production_fixed_cost", "production_variable_cost", "delivery_cost",
    "marketing_fee", "franchisee_opex", "franchisee_ebitda", "franchisee_cash_flow",
  ]);
  assert.deepEqual(layer.scenario_matrix.map((item: { own_unit_count: number; franchise_unit_count: number }) => [item.own_unit_count, item.franchise_unit_count]), [[1, 0], [1, 3], [1, 5], [1, 9]]);
  assert.equal(layer.parameters.find((item: { id: string }) => item.id === "central_production_capacity").value, 10);
  assert.equal(layer.parameters.find((item: { id: string }) => item.id === "franchise_entry_fee").value, 1_000_000);
  assert.equal(layer.parameters.find((item: { id: string }) => item.id === "royalty_rate").value, 0.05);
  assert.ok(layer.parameters.filter((item: { status: string }) => item.status === "missing_input").length >= 6);
  assert.match(layer.explicit_non_outputs.join("\n"), /Не выводить сценарный результат/);
});

test("Franchise assumptions use RUB and retain explicit research status", () => {
  const assumptions = yaml<{ assumptions: Array<Record<string, any>> }>("docs-platform/registry/assumptions.yaml").assumptions;
  const entryFee = assumptions.find(item => item.id === "ASM-FRANCHISE-ENTRY-FEE");
  const capacity = assumptions.find(item => item.id === "ASM-FRANCHISE-CENTRAL-PRODUCTION-CAPACITY");
  const petroBase = assumptions.find(item => item.id === "ASM-PETROGRADKA-INFRASTRUCTURE-BASE");
  assert.deepEqual({ value: entryFee?.value, unit: entryFee?.unit, status: entryFee?.status }, { value: 1_000_000, unit: "RUB", status: "research" });
  assert.deepEqual({ value: capacity?.value, status: capacity?.status }, { value: 10, status: "research" });
  assert.deepEqual(petroBase?.value, { from_rub: 3_000_000, to_rub: 3_600_000 });
  const trackedText = [
    "docs-platform/02-franchise-platform-strategy.md",
    "docs-platform/scenarios/petrogradka-ready-production-base.yaml",
    "docs-platform/working/franchise-platform-parameters.yaml",
  ].map(relativePath => fs.readFileSync(path.join(project, relativePath), "utf8")).join("\n");
  assert.doesNotMatch(trackedText, /\$1m|\$\s*1[, ]?000[, ]?000/i);
});

test("Petrogradka owner presentation keeps new launch estimates proposed and leaves the canonical scenario unchanged", () => {
  const assumptions = yaml<{ assumptions: Array<Record<string, any>> }>("docs-platform/registry/assumptions.yaml").assumptions;
  const decisions = yaml<{ decisions: Array<Record<string, any>> }>("docs-platform/registry/decisions.yaml").decisions;
  const documents = yaml<{ documents: Array<Record<string, any>> }>("docs-platform/registry/documents.yaml").documents;
  const estimates = [
    assumptions.find(item => item.id === "ASM-PETROGRADKA-DIGITAL-PLATFORM-FIRST-VERSION"),
    assumptions.find(item => item.id === "ASM-PETROGRADKA-COLOCATED-LAUNCH-CONFIGURATION"),
    assumptions.find(item => item.id === "ASM-PETROGRADKA-SEPARATE-REFERENCE-UNIT-LAUNCH-CONFIGURATION"),
  ];

  assert.deepEqual(estimates.map(item => ({ value: item?.value, unit: item?.unit, status: item?.status })), [
    { value: { maximum_rub: 2_500_000 }, unit: "RUB", status: "proposed" },
    { value: { minimum_rub: 6_000_000 }, unit: "RUB", status: "proposed" },
    { value: { from_rub: 11_500_000, to_rub: 12_500_000 }, unit: "RUB", status: "proposed" },
  ]);
  assert.ok(estimates.every(item => item?.scenario === "PETROGRADKA / READY_PRODUCTION_BASE"));
  assert.equal(decisions.find(item => item.id === "DEC-PETROGRADKA-LANDLORD-PRESENTATION-2026-09-08-01")?.status, "approved");
  assert.equal(documents.find(item => item.id === "DOC-PETROGRADKA-LANDLORD-PROPOSITION")?.status, "proposed");

  const scenario = yaml<any>("docs-platform/scenarios/petrogradka-ready-production-base.yaml");
  assert.equal(scenario.document.status, "research");
  assert.equal(scenario.document.scenario_id, "PETROGRADKA");
  assert.equal(scenario.equipment.status, "available_subject_to_confirmation");
  assert.deepEqual(scenario.capex.infrastructure_base_without_trading_point.range_rub, [3_000_000, 3_600_000]);
});
