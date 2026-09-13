/** Independent cases cover input semantics and source integration, beyond the v0.1 cash identities. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  formatNumber,
  formatMoney,
  formatPercent,
  formatHeadline,
  formatInput,
  parseControlNumber,
} from "../src/lib/control-format";
import {
  workingScenarioV2,
  workingScenario,
  parameters,
  setInput,
  parameterStatus,
  newStore,
  STORAGE_KEY,
} from "../src/lib/franchise-model-scenario";
import {
  inputState,
  ownLocalCosts,
  maintenanceReference,
  taxReference,
  salesFactor,
  referenceValues,
} from "../src/lib/franchise-model-data";
import { equipmentBom, equipmentCatalog } from "../src/lib/franchise-model-bom";
import {
  calculateFranchiseModel,
  firstNode,
  franchisePoint,
  ownPoint,
  pointSales,
} from "../src/lib/franchise-model-engine";
import { loadStore, parseStore } from "../src/lib/franchise-model-storage";
const compact = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
const state = (s: ReturnType<typeof workingScenarioV2>, id: string) =>
  inputState(
    s,
    parameters.find((p) => p.id === id)!,
  );
function complete() {
  let s = workingScenarioV2();
  for (const [id, v] of Object.entries({
    own_household_fixed: 20000,
    maintenance_extra: 10000,
    point_software: 10000,
    extra_production: 20000,
    onboarding: 300000,
  }))
    s = setInput(s, id, v);
  return s;
}

test("ru-RU money, percentages, FTE and headline have practical precision", () => {
  assert.equal(compact(formatMoney(5298993.33)), "5 298 993 ₽");
  assert.equal(compact(formatMoney(1165.4, 2)), "1 165,40 ₽");
  assert.equal(compact(formatInput(2500000)), "2 500 000");
  assert.equal(formatNumber(2.5090909), "2,51");
  assert.equal(formatPercent(0.1875), "18,75 %");
  assert.equal(formatPercent(0.57), "57 %");
  assert.equal(formatHeadline(23172720.6, true, true), "≈23,17 млн ₽ / мес.");
  assert.equal(formatNumber(null), "Не рассчитано");
  assert.equal(formatHeadline(null), "Недостаточно данных");
  for (const n of [27.7777777778, 1165.40000001, 23172720.602727, -112.34567])
    assert.doesNotMatch(formatInput(n), /[.,]\d{4}/);
});
test("parsing accepts grouped spaces, comma or dot and preserves zero vs empty", () => {
  for (const text of ["1 165,40", "1\u00a0165.40", "1\u202f165,40"])
    assert.deepEqual(parseControlNumber(text), {
      kind: "value",
      value: 1165.4,
    });
  assert.deepEqual(parseControlNumber("0"), { kind: "value", value: 0 });
  assert.deepEqual(parseControlNumber(" "), { kind: "empty" });
  for (const text of ["1,2,3", "NaN", "Infinity", "1e8", "3 ₽", "1.2.3", "--2"])
    assert.deepEqual(parseControlNumber(text), { kind: "invalid" });
  assert.deepEqual(parseControlNumber("27,7777777778"), {
    kind: "value",
    value: 27.7777777778,
  });
});
test("reference snapshot exactly matches governed sources and assumption IDs", () => {
  assert.match(
    execFileSync(process.execPath, ["scripts/franchise-model-references.cjs"], {
      encoding: "utf8",
    }),
    /PASS/,
  );
});
test("embedded own point is not applicable, missing costs stay unknown, explicit zero is working", () => {
  const s = workingScenarioV2();
  for (const id of [
    "own_external_rent",
    "own_growth_capex",
    "own_utilities",
    "own_admin",
  ])
    assert.equal(state(s, id).kind, "not_applicable");
  for (const id of [
    "franchise_capex",
    "onboarding",
    "point_software",
    "extra_production",
    "maintenance_extra",
  ]) {
    assert.equal(s.inputs[id], null);
    assert.equal(state(s, id).kind, "missing");
  }
  assert.equal(
    state(setInput(s, "point_software", 0), "point_software").kind,
    "value",
  );
  assert.equal(
    parameterStatus(setInput(s, "point_software", 0), "point_software"),
    "WORKING",
  );
});
test("standalone own point requires separate rent/capital/operations, without counting them twice embedded", () => {
  const s = setInput(workingScenarioV2(), "embedded", 0);
  for (const id of [
    "own_external_rent",
    "own_growth_capex",
    "own_utilities",
    "own_admin",
  ])
    assert.equal(state(s, id).kind, "missing");
  const issues = calculateFranchiseModel(s).issues;
  assert.ok(issues.some((i) => i.id === "own_external_rent"));
  assert.ok(issues.some((i) => i.id === "own_growth_capex"));
  const a = complete(),
    b = setInput(a, "retail_allocation", 0.75);
  near(
    calculateFranchiseModel(a).result!.months[11].knownFcf,
    calculateFranchiseModel(b).result!.months[11].knownFcf,
  );
});
test("node BOM derives canonical prices, excludes BAR/GROW and retains legacy reference", () => {
  const s = workingScenarioV2(),
    bom = equipmentBom(s, "node");
  assert.ok(bom.complete);
  near(bom.knownTotal, 4617521.33);
  near(referenceValues.equipment, 5298993.33);
  assert.ok(
    !bom.rows.some(
      (r) => r.applicable && ["bar", "grow"].includes(r.item!.group),
    ),
  );
  s.integration!.bar = true;
  s.integration!.grow = true;
  assert.ok(equipmentBom(s, "node").knownTotal > bom.knownTotal);
  assert.ok(bom.breakdown.some((r) => r.group === "it" && r.amount > 0));
  assert.equal(parameterStatus(s, "equipment"), "DERIVED");
});
test("scenario stores only selection/quantity/override, price follows source until explicit override", () => {
  const s = workingScenarioV2(),
    before = equipmentBom(s, "node").knownTotal,
    row = s.integration!.nodeBom.find((r) => r.itemId === "CAPEX-02-001")!,
    catalog = equipmentCatalog.find((r) => r.id === row.itemId)!;
  assert.deepEqual(Object.keys(row).sort(), [
    "itemId",
    "override",
    "quantity",
    "selected",
  ]);
  row.override = 12345;
  near(
    equipmentBom(s, "node").knownTotal,
    before + (12345 - catalog.unitPrice!) * row.quantity!,
  );
  row.override = null;
  near(equipmentBom(s, "node").knownTotal, before);
});
test("unknown selected node equipment blocks draw and invalid negative BOM is rejected", () => {
  const s = workingScenarioV2();
  s.integration!.nodeBom.push({
    itemId: "UNCLASSIFIED",
    selected: true,
    quantity: 1,
    override: null,
  });
  assert.equal(equipmentBom(s, "node").complete, false);
  assert.equal(calculateFranchiseModel(s).result, null);
  const negative = workingScenarioV2();
  negative.integration!.nodeBom[0].quantity = -1;
  assert.equal(calculateFranchiseModel(negative).status, "INVALID");
});
test("franchise compact BOM remains partial with scanner/refrigeration/full-opening gaps and payback blocked", () => {
  const s = workingScenarioV2(),
    bom = equipmentBom(s, "franchise");
  assert.ok(bom.knownTotal > 0);
  assert.equal(bom.unpriced, 3);
  assert.equal(bom.complete, false);
  for (const id of [
    "CAPEX-02-001",
    "CAPEX-02-002",
    "CAPEX-02-003",
    "CAPEX-04-001",
    "CAPEX-04-003",
  ])
    assert.ok(bom.rows.some((r) => r.itemId === id));
  assert.equal(franchisePoint(s).payback, null);
});
test("acquiring and structured OPEX use source percentages/per-check costs; unknown fixed household is not zero", () => {
  const s = workingScenarioV2(),
    o = ownLocalCosts(s, 6000000, 6000000 / 1165.4, true);
  near(o.lines.find((l) => l.id === "own_acquiring")!.amount!, 120000);
  near(
    o.lines.find((l) => l.id === "own_household_per_check")!.amount!,
    (6000000 / 1165.4) * (50000 / 9000),
  );
  near(o.lines.find((l) => l.id === "own_marketing_rate")!.amount!, 144000);
  assert.equal(o.total, null);
  assert.equal(
    o.lines.find((l) => l.id === "own_utilities")!.notApplicable,
    true,
  );
  const missing = ownLocalCosts(
    setInput(s, "own_acquiring", null),
    6000000,
    5000,
    true,
  );
  assert.equal(missing.lines[0].amount, null);
});
test("reference tax uses existing max(profit tax, minimum inflow) helper", () => {
  const s = workingScenarioV2();
  near(taxReference(s, 6000000, 1000000)!, 70000);
  near(taxReference(s, 6000000, -1000000)!, 60000);
  assert.equal(parameterStatus(s, "tax_profit"), "REFERENCE");
});
test("maintenance uses equipment/furniture at 3 percent annual and keeps digital gap", () => {
  const s = workingScenarioV2(),
    m = maintenanceReference(s);
  near(m.equipmentAndFurniture, ((4617521.33 + 425000) * 0.03) / 12);
  assert.equal(m.complete, false);
  assert.equal(m.extra, null);
  assert.equal(state(s, "maintenance_growth").kind, "not_applicable");
  const filled = setInput(s, "maintenance_extra", 10000);
  assert.equal(maintenanceReference(filled).complete, true);
  near(maintenanceReference(filled).known, m.known + 10000);
});
test("reference ramp follows point age; mature unit view is neutral", () => {
  const s = workingScenarioV2();
  s.integration!.seasonality = false;
  const p = s.rollout[1];
  near(salesFactor(s, p, 9), 0.6);
  near(salesFactor(s, p, 10), 0.7);
  near(salesFactor(s, p, 15), 1);
  near(pointSales(s, "FRANCHISE", p, 9).sales, 3600000);
  near(franchisePoint(s).sales, 6000000);
  p.ramp = "mature";
  near(salesFactor(s, p, 9), 1);
});
test("seasonality applies calendar profile independently of ramp and can be disabled", () => {
  const s = workingScenarioV2(),
    p = s.rollout[1];
  near(salesFactor(s, p, 9), 0.6 * 1.12);
  s.integration!.calendarStartMonth = 2;
  near(salesFactor(s, p, 9), 0.6 * 1.16);
  s.integration!.seasonality = false;
  near(salesFactor(s, p, 9), 0.6);
});
test("target/actual franchise economics preserve settlement, expensive rent lowers actual only", () => {
  let s = workingScenarioV2();
  const p = franchisePoint(s);
  near(p.settlement, 3420000);
  near(p.ebitda, 900000);
  s = setInput(setInput(s, "actual_mode", 1), "actual_rent", 1000000);
  const actual = franchisePoint(s);
  near(actual.settlement, p.settlement);
  assert.ok(actual.ebitda < p.ebitda);
});
test("unfilled costs block final investor but explicit shadow enumerates exclusions without filling inputs", () => {
  const s = workingScenarioV2(),
    r = calculateFranchiseModel(s).result!;
  assert.equal(r.investor.completeInputs, false);
  assert.equal(r.investor.irr, null);
  assert.equal(r.months[23].fcf, null);
  assert.ok(r.shadowInvestor);
  assert.ok(r.shadowInvestor!.irr !== null);
  for (const id of [
    "point_software",
    "extra_production",
    "onboarding",
    "own_household_fixed",
    "maintenance_extra",
  ])
    assert.ok(r.shadowExclusions.some((i) => i.id === id));
  assert.equal(s.inputs.point_software, null);
  assert.equal(s.inputs.extra_production, null);
  const noTax = setInput(s, "tax_profit", null);
  assert.equal(calculateFranchiseModel(noTax).result!.shadowInvestor, null);
});
test("missing counts are actual distinct inputs; methodological caveats remain separate", () => {
  const m = calculateFranchiseModel(workingScenarioV2()),
    missing = [
      ...new Set(
        m.issues.filter((i) => i.severity === "missing").map((i) => i.id),
      ),
    ];
  assert.equal(missing.length, 6);
  assert.ok(!missing.includes("capacity-working"));
  assert.ok(
    m.issues.some(
      (i) => i.id === "legal-structure" && i.severity === "warning",
    ),
  );
});
test("M0 staged draw equals computed initial requirement, commitment is not invested upfront", () => {
  const s = complete(),
    r = calculateFranchiseModel(s).result!;
  near(r.investor.timeline[0].draw, firstNode(s).initialDraw);
  near(r.node.initialDraw, 22491248.602727);
  near(r.node.burn, 1947181.81818);
  near(r.investor.undrawn, 40000000 - r.investor.totalDrawn);
  assert.ok(r.investor.timeline[0].draw < 40000000);
  assert.ok(r.investor.completeInputs);
  assert.equal(r.shadowInvestor, null);
});
test("milestone counts follow preserved M9/12/15/18 schedule and capacity stays five", () => {
  const r = calculateFranchiseModel(workingScenarioV2()).result!;
  for (const [month, franchises] of [
    [12, 2],
    [24, 4],
    [36, 4],
    [60, 4],
  ]) {
    assert.equal(r.months[month - 1].ownCount, 1);
    assert.equal(r.months[month - 1].franchiseCount, franchises);
    assert.equal(r.months[month - 1].capacity, 5);
  }
  assert.equal(r.capacityExceededMonth, null);
});
test("legacy storage migration preserves explicit amounts and zero, separate namespace unchanged", () => {
  const s = workingScenario();
  s.inputs.equipment = 1234567;
  s.inputs.point_software = 0;
  s.edited = ["equipment", "point_software"];
  const raw = JSON.stringify({
    schemaVersion: 1,
    activeId: s.id,
    compareIds: [s.id],
    scenarios: [s],
  });
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, STORAGE_KEY);
      return raw;
    },
  };
  const migrated = loadStore(storage).store.scenarios[0];
  assert.equal(migrated.inputs.equipment, 1234567);
  assert.equal(migrated.integration!.equipmentMode, "manual");
  assert.equal(migrated.inputs.point_software, 0);
  assert.equal(migrated.inputs.extra_production, null);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(parseStore(JSON.stringify(newStore()))?.schemaVersion, 1);
});

test('unused manual equipment amount is not missing when a complete BOM is selected',()=>{
 const s=workingScenarioV2();s.inputs.equipment=null;
 assert.ok(calculateFranchiseModel(s).result);assert.equal(parameterStatus(s,'equipment'),'DERIVED');
 s.integration!.equipmentMode='manual';assert.equal(calculateFranchiseModel(s).status,'INVALID');
});
