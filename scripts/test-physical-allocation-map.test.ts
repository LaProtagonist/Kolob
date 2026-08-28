import assert from "node:assert/strict";
import test from "node:test";
import { capexData } from "../src/lib/capex-runtime.js";
import { launchModel } from "../src/lib/launch-budget.js";
import {
  allocationRecordsFor,
  financialModelAllocationItemIds,
  findPhysicalAllocation,
  investorStartAllocationFieldIds,
  networkPlanningAllocationItemIds,
  physicalAllocationIntegrityErrors,
  physicalAllocationMap,
} from "../src/lib/physical-allocation.js";

const catalog = {
  equipmentModuleIds: new Set(capexData.modules.map((module) => module.id)),
  equipmentItemIds: new Set(capexData.items.map((item) => item.id)),
  preparationCategoryIds: new Set(launchModel.preparation.categories.map((category) => category.id)),
  financialModelItemIds: new Set(financialModelAllocationItemIds),
  investorStartFieldIds: new Set(investorStartAllocationFieldIds),
  networkPlanningItemIds: new Set(networkPlanningAllocationItemIds),
};

test("physical allocation map has only known source references and no duplicate semantics", () => {
  assert.deepEqual(physicalAllocationIntegrityErrors(physicalAllocationMap, catalog), []);
});

test("unknown canonical references fail the allocation validation", () => {
  const invalid = [
    ...physicalAllocationMap,
    {
      ...physicalAllocationMap[0],
      id: "INVALID-REFERENCE-CHECK",
      sourceRefs: [{ kind: "equipment_item" as const, id: "CAPEX-UNKNOWN-000" }],
    },
  ];
  assert.match(
    physicalAllocationIntegrityErrors(invalid, catalog).join("\n"),
    /INVALID-REFERENCE-CHECK references unknown equipment item CAPEX-UNKNOWN-000/,
  );
});

test("allocation metadata contains no copied financial values", () => {
  const containsNumber = (value: unknown): boolean => {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (value && typeof value === "object") return Object.values(value).some(containsNumber);
    return false;
  };
  assert.equal(containsNumber(physicalAllocationMap), false);
});

test("confirmed equipment allocation keeps production once and point equipment repeatable", () => {
  for (const id of ["MOD-PREP", "MOD-GROW", "CAPEX-04-002"]) {
    const record = findPhysicalAllocation(id)!;
    assert.equal(record.physicalScope, "production");
    assert.equal(record.scalingDriver, "once");
    assert.equal(record.status, "confirmed");
  }
  for (const id of ["MOD-RETAIL-HOT", "CAPEX-04-001", "CAPEX-04-003"]) {
    const record = findPhysicalAllocation(id)!;
    assert.equal(record.physicalScope, "both_point_formats");
    assert.equal(record.scalingDriver, "per_point");
  }
});

test("seating-only records never apply to takeaway", () => {
  for (const id of ["MOD-GUEST", "FURNITURE-SEATING", "PREP-GUEST-AREA"]) {
    const record = findPhysicalAllocation(id)!;
    assert.equal(record.physicalScope, "seating_point");
    assert.equal(record.appliesTo?.includes("takeaway_point") ?? false, false);
  }
});

test("integrated wash remains unresolved while B3 local point wash uses priced register components", () => {
  const integratedWash = findPhysicalAllocation("MOD-WASH")!;
  assert.equal(integratedWash.physicalScope, "mixed");
  assert.equal(integratedWash.status, "unresolved");
  assert.equal(integratedWash.referenceContext, "integrated_pilot_200m2");
  assert.equal(integratedWash.referenceOnly, true);

  for (const id of ["POINT-WASH-SEATING", "POINT-WASH-TAKEAWAY"]) {
    const record = findPhysicalAllocation(id)!;
    assert.equal(record.pricingStatus, "canonical_source");
    assert.equal(record.status, "owner_decision");
    assert.equal(record.scalingDriver, "per_point");
  }
});

test("preparation reference preserves all eight canonical categories without copying their amounts", () => {
  const preparation = physicalAllocationMap.filter((record) => record.category === "preparation");
  assert.deepEqual(
    preparation.map((record) => record.id),
    [
      "PREP-BUILDING",
      "PREP-ELECTRICAL",
      "PREP-WATER-DRAINAGE",
      "PREP-VENTILATION",
      "PREP-LIGHTING",
      "PREP-GUEST-AREA",
      "PREP-BUILT-IN",
      "PREP-DESIGN",
    ],
  );
  assert.equal(findPhysicalAllocation("PREP-WATER-DRAINAGE")?.scalingDriver, "wet_points_based");
  assert.equal(findPhysicalAllocation("PREP-GUEST-AREA")?.physicalScope, "seating_point");
  assert.ok(preparation.every((record) => record.referenceContext === "integrated_pilot_200m2" && record.referenceOnly));
});

test("launch reserve stays unresolved and shared launch marketing is not multiplied by a point record", () => {
  assert.equal(findPhysicalAllocation("OPERATING-RESERVE")?.physicalScope, "unresolved");
  assert.equal(findPhysicalAllocation("OPERATING-RESERVE")?.status, "unresolved");
  assert.equal(findPhysicalAllocation("LAUNCH-MARKETING")?.physicalScope, "shared_network");
  assert.equal(findPhysicalAllocation("LAUNCH-MARKETING")?.scalingDriver, "manual");
});

test("scope helper exposes an explicit empty takeaway pricing set rather than inheriting seating furniture", () => {
  const takeaway = allocationRecordsFor("takeaway_point");
  assert.ok(takeaway.some((record) => record.id === "POINT-WASH-TAKEAWAY"));
  assert.equal(takeaway.some((record) => record.id === "FURNITURE-SEATING"), false);
});
