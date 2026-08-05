import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { platformRoot } from "../src/google/config.js";
import { checkInvestorStartModel, INVESTOR_START_PAYLOAD_PATH, previewInvestorStartReverse, validateInvestorStartModel } from "../src/investor/start-model.js";
import {
  calculateLaunchBudget,
  calculateOperatingReserve,
  calculateOtherArea,
  calculateSeatCount,
  defaultLaunchBudgetState,
  normalizeLaunchBudgetState,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
} from "../../../src/lib/launch-budget.js";
import { buildCapexRows, capexData, emptyCapexParameters, summarizeEquipment } from "../../../src/lib/capex-runtime.js";

const projectRoot = path.resolve(platformRoot, "..");
const modelPath = path.join(projectRoot, "docs-platform/working/investor-start-model.yaml");
const payloadPath = path.join(projectRoot, INVESTOR_START_PAYLOAD_PATH);

function filled(overrides: Partial<LaunchBudgetState> = {}): LaunchBudgetState {
  return {
    ...defaultLaunchBudgetState(),
    purchasePriceRub: 20_000_000,
    monthlyRentRub: 500_000,
    totalAreaM2: 300,
    kitchenAreaM2: 120,
    guestAreaM2: 100,
    preparationRub: 4_000_000,
    monthlyOpexExcludingRentRub: 2_000_000,
    ...overrides,
  };
}

test("Investor Start Model validates against its schema and canonical references", () => {
  assert.deepEqual(validateInvestorStartModel(YAML.parse(fs.readFileSync(modelPath, "utf8"))), []);
  assert.equal(checkInvestorStartModel().validation, "OK");
});

test("canonical model is byte-identical to the approved payload", () => {
  assert.equal(fs.readFileSync(modelPath, "utf8"), fs.readFileSync(payloadPath, "utf8"));
});

test("1. other area is calculated from total, kitchen and guest areas", () => {
  assert.deepEqual(calculateOtherArea(300, 120, 100), { invalid: false, value: 80 });
});

test("2. kitchen and guest areas cannot exceed total area", () => {
  assert.deepEqual(calculateOtherArea(200, 120, 100), { invalid: true, value: null });
  assert.equal(calculateLaunchBudget(filled({ totalAreaM2: 200, kitchenAreaM2: 120, guestAreaM2: 100 })).financingRequirementRub, null);
});

test("3. preliminary seats are rounded down", () => {
  assert.equal(calculateSeatCount(99, 1.6), 61);
});

test("4. all three seating density profiles work", () => {
  assert.equal(calculateLaunchBudget(filled({ seatingProfileId: "efficient" })).seatCount, 71);
  assert.equal(calculateLaunchBudget(filled({ seatingProfileId: "balanced" })).seatCount, 62);
  assert.equal(calculateLaunchBudget(filled({ seatingProfileId: "comfortable" })).seatCount, 55);
});

test("5. furniture is calculated from preliminary seat count", () => {
  const result = calculateLaunchBudget(filled({ guestAreaM2: 100, furnitureProfileId: "balanced" }));
  assert.equal(result.furnitureRub, 62 * 8500);
});

test("6. CAPEX-05 furniture is not counted in equipment a second time", () => {
  assert.equal(calculateLaunchBudget(filled()).equipment.rows.some(row => row.item.id.startsWith("CAPEX-05-")), false);
});

test("7. purchase entry equals the property price", () => {
  assert.equal(calculateLaunchBudget(filled({ premisesScenario: "purchase", purchasePriceRub: 23_000_000 })).premisesEntryRub, 23_000_000);
});

test("8. rent entry includes prepayment and deposit", () => {
  const result = calculateLaunchBudget(filled({ premisesScenario: "rent", monthlyRentRub: 500_000, prepaymentMonths: 3, securityDepositMonths: 2 }));
  assert.equal(result.premisesEntryRub, 2_500_000);
});

test("9. rent deposit is separated as tied or conditionally refundable funds", () => {
  const result = calculateLaunchBudget(filled({ premisesScenario: "rent", monthlyRentRub: 500_000, securityDepositMonths: 2 }));
  assert.equal(result.tiedFundsRub, 1_000_000);
});

test("10. prepaid rent is not duplicated in operating reserve", () => {
  const state = filled({ premisesScenario: "rent", monthlyRentRub: 500_000, prepaymentMonths: 3, operatingReserveMonths: 6, monthlyOpexExcludingRentRub: 2_000_000 });
  assert.equal(calculateOperatingReserve(state), 2_000_000 * 6 + 500_000 * 3);
});

test("11. purchase operating reserve excludes rent", () => {
  const state = filled({ premisesScenario: "purchase", monthlyRentRub: 9_000_000, operatingReserveMonths: 6, monthlyOpexExcludingRentRub: 2_000_000 });
  assert.equal(calculateOperatingReserve(state), 12_000_000);
});

test("12. rent reserve uses max(months minus prepayment, zero)", () => {
  const state = filled({ premisesScenario: "rent", monthlyRentRub: 500_000, prepaymentMonths: 12, operatingReserveMonths: 6, monthlyOpexExcludingRentRub: 2_000_000 });
  assert.equal(calculateOperatingReserve(state), 12_000_000);
});

test("13. contingency does not apply to property purchase", () => {
  const first = calculateLaunchBudget(filled({ purchasePriceRub: 20_000_000 }));
  const second = calculateLaunchBudget(filled({ purchasePriceRub: 80_000_000 }));
  assert.equal(first.contingencyRub, second.contingencyRub);
});

test("14. contingency does not apply to security deposit", () => {
  const first = calculateLaunchBudget(filled({ premisesScenario: "rent", securityDepositMonths: 1 }));
  const second = calculateLaunchBudget(filled({ premisesScenario: "rent", securityDepositMonths: 3 }));
  assert.equal(first.contingencyRub, second.contingencyRub);
});

test("15. contingency does not apply to operating reserve", () => {
  const first = calculateLaunchBudget(filled({ monthlyOpexExcludingRentRub: 1_000_000 }));
  const second = calculateLaunchBudget(filled({ monthlyOpexExcludingRentRub: 5_000_000 }));
  assert.equal(first.contingencyRub, second.contingencyRub);
});

test("16. contingency applies to equipment, furniture and known preparation", () => {
  const result = calculateLaunchBudget(filled({ contingencyPercent: 10 }));
  assert.equal(result.contingencyRub, Math.round((result.equipment.total + result.furnitureRub! + 4_000_000) * 10) / 100);
});

test("17. unknown preparation is not silently treated as complete zero", () => {
  const result = calculateLaunchBudget(filled({ preparationRub: null }));
  assert.equal(result.partial, true);
  assert.equal(result.contingencyPartial, true);
  assert.ok(result.missing.some(item => item.includes("Подготовка помещения")));
});

test("18. unknown OPEX leaves operating reserve unknown", () => {
  const result = calculateLaunchBudget(filled({ monthlyOpexExcludingRentRub: null }));
  assert.equal(result.operatingReserveRub, null);
  assert.equal(result.partial, true);
});

test("19. incomplete data produces a lower-bound partial total", () => {
  const result = calculateLaunchBudget(defaultLaunchBudgetState());
  assert.ok((result.financingRequirementRub ?? 0) > 0);
  assert.equal(result.partial, true);
});

test("20. one combi oven is counted once when MOD-PREP is active", () => {
  const result = calculateLaunchBudget(filled());
  const oven = result.equipment.rows.find(row => row.item.id === "CAPEX-01-009");
  assert.equal(oven?.quantity, 1);
  assert.equal(oven?.links.length, 1);
});

test("21. a format without MOD-PREP does not include the combi oven", () => {
  const rows = buildCapexRows(new Set(["MOD-RETAIL-HOT", "MOD-POS"]), "base", emptyCapexParameters());
  assert.equal(rows.some(row => row.item.id === "CAPEX-01-009"), false);
});

test("22. included_in_parent records are not independently summed", () => {
  const rows = buildCapexRows(new Set(["MOD-BAR"]), "base", emptyCapexParameters());
  const summary = summarizeEquipment(rows);
  assert.equal(summary.rows.filter(row => row.includedInParent).some(row => row.lineTotal !== null), false);
});

test("23. equipment totals are derived from snapshot rows", () => {
  const result = calculateLaunchBudget(filled());
  const sum = result.equipment.rows.filter(row => row.independentProcurement && row.lineTotal !== null).reduce((total, row) => total + row.lineTotal!, 0);
  assert.equal(result.equipment.total, sum);
  assert.equal(capexData.investorStartModel.source_sha256, "d5b1f6c939f7067298769cd0faea75f853c7592c847b32a158bae32a7e91f257");
});

test("24. equipment scenario changes recalculate the total", () => {
  const minimum = calculateLaunchBudget(filled({ equipmentScenarioId: "MINIMUM" })).equipment.total;
  const base = calculateLaunchBudget(filled({ equipmentScenarioId: "BASE" })).equipment.total;
  const scale = calculateLaunchBudget(filled({ equipmentScenarioId: "SCALE_READY" })).equipment.total;
  assert.ok(minimum < base && base < scale, `${minimum} < ${base} < ${scale}`);
});

test("25. BAR and GROW switches recalculate equipment", () => {
  const all = calculateLaunchBudget(filled({ barEnabled: true, growEnabled: true })).equipment.total;
  const none = calculateLaunchBudget(filled({ barEnabled: false, growEnabled: false })).equipment.total;
  assert.ok(all > none);
});

test("26. local-state normalization does not mutate canonical snapshot", () => {
  const before = JSON.stringify(capexData);
  normalizeLaunchBudgetState({ purchasePriceRub: 123, barEnabled: false });
  assert.equal(JSON.stringify(capexData), before);
});

test("27. reset restores the governed demonstration scenario and leaves canonical data intact", () => {
  const before = JSON.stringify(capexData.investorStartModel);
  const reset = defaultLaunchBudgetState();
  assert.equal(reset.premisesScenario, "rent");
  assert.equal(reset.purchasePriceRub, 69_000_000);
  assert.equal(reset.monthlyRentRub, 350_000);
  assert.equal(reset.prepaymentMonths, 12);
  assert.equal(reset.securityDepositMonths, 2);
  assert.equal(reset.totalAreaM2, 200);
  assert.equal(reset.kitchenAreaM2, 90);
  assert.equal(reset.guestAreaM2, 80);
  assert.equal(JSON.stringify(capexData.investorStartModel), before);
});

test("28. legacy empty local state migrates to the demonstration defaults", () => {
  const migrated = restoreLaunchBudgetState({
    premisesScenario: "purchase",
    purchasePriceRub: null,
    monthlyRentRub: null,
    prepaymentMonths: 1,
    securityDepositMonths: 2,
    totalAreaM2: null,
    kitchenAreaM2: null,
    guestAreaM2: null,
  });
  assert.deepEqual(migrated, defaultLaunchBudgetState());
});

test("29. annual default rent prepayment is not repeated in a six-month operating reserve", () => {
  const state = filled({
    premisesScenario: "rent",
    monthlyRentRub: 350_000,
    prepaymentMonths: 12,
    securityDepositMonths: 2,
    operatingReserveMonths: 6,
    monthlyOpexExcludingRentRub: 2_000_000,
  });
  assert.equal(calculateOperatingReserve(state), 12_000_000);
  const result = calculateLaunchBudget(state);
  assert.equal(result.premisesEntryRub, 4_900_000);
  assert.equal(result.tiedFundsRub, 700_000);
});

test("30. public presentation hides internal documents and technical wording", () => {
  const model = capexData.investorStartModel;
  assert.deepEqual(model.documents_block.public_documents, []);
  assert.equal(model.documents_block.public_bma_available, false);
  const publicCopy = JSON.stringify(model.public_presentation).toLowerCase();
  for (const forbidden of ["потребност", "стартовый раунд", "research", "approved", "v0.1", "prp-", "snapshot", "registry", "payload", "change set"]) {
    assert.equal(publicCopy.includes(forbidden), false, forbidden);
  }
});

test("31. current-configuration summary follows active BAR and GROW modules", () => {
  const full = calculateLaunchBudget(filled({ barEnabled: true, growEnabled: true }));
  const reduced = calculateLaunchBudget(filled({ barEnabled: false, growEnabled: false }));
  assert.equal(full.activeModuleIds.includes("MOD-BAR"), true);
  assert.equal(full.activeModuleIds.includes("MOD-GROW"), true);
  assert.equal(reduced.activeModuleIds.includes("MOD-BAR"), false);
  assert.equal(reduced.activeModuleIds.includes("MOD-GROW"), false);
});

test("32. governed reverse preview restores the previous public presentation without applying it", () => {
  const preview = previewInvestorStartReverse(undefined, "CHG-ROLLBACK-LAUNCH-COST-PREVIEW", "DEC-ROLLBACK-PREVIEW") as any;
  assert.equal(preview.apply_allowed, false);
  assert.equal(preview.restores_original_hash, true);
  assert.equal(preview.restores_previous_public_copy, true);
  const operation = preview.reverse_change_set.operations.find((item: any) => item.type === "restore_public_presentation_from_audit_receipt");
  assert.equal(operation.restore_values.page_title, "Расчёт стартового раунда инвестиций");
  assert.equal(operation.restore_values.total_title, "Ориентировочная потребность в финансировании");
  assert.equal(operation.restore_values.internal_document_links_visible, true);
});
