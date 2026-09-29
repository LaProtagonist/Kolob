import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { projectSennaya } from "./sennaya-projection";
import { capexData } from "../src/lib/capex-runtime";
import { openingBudgetGroups, openingBudgetKey, selectOpeningBudget, type OpeningBudgetSelection } from "../src/lib/property-funding";
import { pageByPath } from "../src/content/site";

const before = JSON.stringify(capexData);
const result = projectSennaya();
const base = result.audit.projections[1];
const full = result.public.openingBudgetVariants["11111"];
const item = (id: string) => base.pointItems.find(row => row.id === id || row.id.endsWith(`:${id}`))!;

test("public snapshot matches existing canonical engines without mutating their inputs", () => {
  assert.equal(JSON.stringify(capexData), before);
  assert.deepEqual(JSON.parse(fs.readFileSync("src/content/sennaya-data.json", "utf8")), result.public);
  assert.deepEqual(projectSennaya(), result);
});

test("150/200/250 checks use the canonical check and 30 days, not the proposed 1200", () => {
  assert.equal(result.public.averageCheckRub, 1165.4);
  assert.deepEqual(result.public.revenueScenarios.map(r => r.revenueMonthlyRub), [5244300, 6992400, 8740500]);
  assert.equal(result.public.daysPerMonth, 30);
});

test("500k occupancy is charged in every scenario and property purchase is absent from point capital", () => {
  for (const p of result.audit.projections) {
    assert.equal(p.directOpex.lines.find(l => l.id === "rent")?.amountRub, 500000);
    assert.equal(p.cohort.realEstateMode, "rent");
    assert.equal(p.cohort.purchasePriceRub, null);
    assert.equal(p.pointItems.find(i => i.id.endsWith(":premises"))?.amountRub, null);
    assert.ok(p.directOpex.lines.some(l => l.id === "point-payroll" && l.amountRub! > 0));
    assert.ok(p.directOpex.lines.some(l => l.id === "utilities" && l.amountRub! > 0));
  }
});

test("point BOM uses existing physical allocation, not production or the integrated pilot total", () => {
  const p = result.audit.projections[1];
  assert.ok(p.pointItems.every(i => i.ownership === "point"));
  const details = p.pointItems.flatMap(i => i.detail ?? []);
  assert.ok(details.every(d => !d.moduleIds?.includes("MOD-PREP") && !d.moduleIds?.includes("MOD-GROW")));
  assert.ok(!details.some(d => ["CAPEX-01-001", "CAPEX-01-002", "CAPEX-01-003", "CAPEX-01-018", "CAPEX-04-002"].includes(d.id)));
  assert.equal(result.audit.equipmentSubtotalRub, 2385495);
  assert.equal(result.audit.legacyIntegratedEquipmentRub, 5298993.33);
  assert.equal(result.public.hotPosts, 2);
  assert.equal(result.public.cashierPosts, 2);
});

test("seating remains unapproved and reserve remains unknown until rental terms are set", () => {
  assert.equal(result.public.illustrativeSeats, 26);
  assert.ok(result.audit.projections.every(p => p.cohort.approvedSeatCount === null));
  assert.equal(base.reserve.totalReserveRub, null);
  assert.equal(base.reserve.months, 6);
  assert.ok(result.audit.composition.functions.some(fn => fn.status === "open"));
  assert.ok(!("profitRub" in result.public));
});

test("canonical area preparation overrides the proposed budget ceiling; launch lines are traceable", () => {
  assert.equal(item("point-preparation").amountRub, 4042500);
  assert.equal(full.rows.find(row => row.id === "launch")!.knownRub, 807000);
  assert.equal(Math.round(item("initial-inventory").amountRub!), 234830);
  assert.equal(Math.round(result.audit.knownLaunchSubtotalRub), 8260876);
  assert.equal(result.audit.logistics.externalMonthlyRub, 150000);
});

// These assertions detect omitted opening costs and operating-reserve leakage;
// type checks cannot reconcile amounts or determine the public disclosure boundary.
test("public opening budget excludes internal reserve and explains the OFD 5000", () => {
  assert.equal(item("security").amountRub, 105000);
  assert.equal(full.rows.length, 5);
  assert.equal(full.rows.find(row => row.id === "equipment")!.knownRub, 2490495);
  const installation = result.audit.rows.find(row => row.item.id === "CAPEX-04-011")!;
  const ofd = result.audit.rows.find(row => row.item.id === "CAPEX-04-012")!;
  assert.equal(installation.quantity, 2); assert.equal(installation.unitPrice, 3000);
  assert.equal(ofd.quantity, 2); assert.equal(ofd.unitPrice, 2500); assert.equal(ofd.lineTotal, 5000);
  assert.equal(full.rows.find(row => row.id === "launch")!.knownRub, 700000 + 96000 + installation.lineTotal! + ofd.lineTotal!);
  assert.equal(result.audit.staffing.operatingReserve.knownRub, 7816571.22);
  assert.ok(Math.abs(full.knownRub - 8260876.046666667) < .01);
  assert.ok(Math.abs(full.knownRub - result.audit.knownLaunchSubtotalRub) < .01);
  assert.equal(base.reserve.totalReserveRub, null, "unresolved rent terms never become zero");
  assert.ok(result.audit.staffing.operatingReserve.missingLineIds.includes("uncovered-rent"));
  assert.doesNotMatch(JSON.stringify(result.public), /operatingReserve|reserveMonths|7816571|16077447|engineeringResponsibilities|budgetGroups/);
  const staffing = result.audit.staffing.point;
  assert.deepEqual(staffing.roles.map(role => [role.roleId, role.concurrent, role.rosterHeadcount]), [["CASHIER_BAR",1,2],["LINE_COOK",2,4],["TECHNICAL",1,2]]);
  assert.equal(staffing.totalPayrollRub, 1103594.14);
  assert.equal(result.audit.staffing.sharedManager?.roles[0].roleId, "MANAGER");
  assert.ok(result.audit.staffing.gaps.some(gap => gap.includes("Зарплата до открытия")));
});

// A fixed subtraction passes the all-on test but leaves contingency on excluded work.
// Exhaustive finite scopes check the canonical base, embedded reserve and security exclusion.
test("all 32 work scopes recalculate canonical contingency and never add operating reserve", () => {
  assert.equal(Object.keys(result.public.openingBudgetVariants).length, 32);
  for (let mask = 0; mask < 32; mask++) {
    const selection = Object.fromEntries(openingBudgetGroups.map((id, i) => [id, Boolean(mask & (1 << i))])) as OpeningBudgetSelection;
    const chosen = selectOpeningBudget(result.public.openingBudgetVariants, selection);
    const prep = selection.preparation ? 4042500 : 0;
    const equipment = selection.equipment ? 2490495 : 0;
    const embedded = selection.equipment && selection.contingency ? 39320 : 0;
    const reserve = selection.contingency ? Math.round((prep + (selection.equipment ? 2385495 : 0) + embedded) * 10) / 100 + embedded : 0;
    const expected = prep + equipment + (selection.launch ? 807000 : 0) + (selection.inventory ? 234829.54666666663 : 0) + reserve;
    assert.ok(Math.abs(chosen.knownRub - expected) < .001, openingBudgetKey(selection));
    assert.equal(chosen.rows.find(row => row.id === "contingency")!.knownRub, reserve);
    assert.equal(chosen.rows.reduce((sum, row) => sum + row.knownRub, 0), chosen.knownRub);
    assert.ok(chosen.rows.every(row => row.included === selection[row.id] && (row.included || row.knownRub === 0)));
  }
  assert.equal(result.public.openingBudgetVariants["00000"].knownRub, 0);
  assert.equal(result.public.openingBudgetVariants["00001"].knownRub, 0);
  assert.throws(() => selectOpeningBudget({}, {preparation:true,equipment:true,launch:true,inventory:true,contingency:true}), /Missing canonical/);
});

test("Sennaya inherits share-only noindex and contains no protected route or new global navigation", () => {
  assert.equal(pageByPath("/sennaya").noindex, true);
  const nav = fs.readFileSync("src/content/navigation.ts", "utf8");
  assert.doesNotMatch(nav, /sennaya/);
  const source = fs.readFileSync("src/components/Sennaya.tsx", "utf8");
  assert.doesNotMatch(source, /href="\/control|href="\/investor-terminal|operatingContributionPerPointRub/);
  assert.match(source, /href="\/petrogradka"/);
  assert.match(source, /href="\/investor-questions"/);
});
