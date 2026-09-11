import assert from "node:assert/strict";
import test from "node:test";
import { pageByPath } from "../src/content/site.js";
import {
  franchisePlatformCalculationStatus,
  franchisePlatformParameters,
  franchiseScenarioMatrix,
  franchiseScenarioProfileIds,
  petrogradkaReadyProductionScenario,
} from "../src/lib/franchise-platform.js";

test("Franchise Platform exposes a parameter contract rather than a second financial engine", () => {
  const state = franchisePlatformCalculationStatus();
  assert.equal(state.status, "missing_inputs");
  assert.deepEqual(state.missing, [
    "transfer_price_by_sku", "production_utilization", "production_fixed_cost", "production_variable_cost", "delivery_cost", "marketing_fee", "franchisee_opex",
  ]);
  assert.equal(franchisePlatformParameters.find(item => item.id === "franchisee_ebitda")?.value, null);
  assert.equal(franchisePlatformParameters.find(item => item.id === "franchisee_cash_flow")?.value, null);
  assert.match(state.rule, /существующие контуры point, production, shared_network и logistics/);
});

test("Scenario profiles and Petrogradka boundary remain independently replaceable", () => {
  assert.deepEqual(franchiseScenarioProfileIds, ["READY_PRODUCTION_BASE", "CUSTOM_PRODUCTION_BASE", "OWNED_PRODUCTION_BASE"]);
  assert.deepEqual(franchiseScenarioMatrix, [
    { ownUnitCount: 1, franchiseUnitCount: 0 },
    { ownUnitCount: 1, franchiseUnitCount: 3 },
    { ownUnitCount: 1, franchiseUnitCount: 5 },
    { ownUnitCount: 1, franchiseUnitCount: 9 },
  ]);
  assert.equal(petrogradkaReadyProductionScenario.status, "research");
  assert.equal(petrogradkaReadyProductionScenario.equipmentStatus, "available_subject_to_confirmation");
  assert.deepEqual(petrogradkaReadyProductionScenario.capex.infrastructureBase, [3_000_000, 3_600_000]);
  assert.ok(petrogradkaReadyProductionScenario.excluded.includes("аренда"));
  assert.ok(petrogradkaReadyProductionScenario.excluded.includes("отдельные торговые точки"));
});

test("Petrogradka is a separate share-only page while the strategy no longer has a public route", () => {
  const scenario = pageByPath("/petrogradka");
  assert.equal(scenario.id, "franchisePlatformPetrogradka");
  assert.equal(scenario.noindex, true);
  assert.equal(pageByPath("/investor/franchise-platform").id, "notFound");
  assert.equal(pageByPath("/investor/franchise-platform/petrogradka").id, "notFound");
});
