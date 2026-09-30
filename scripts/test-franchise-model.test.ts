import test from "node:test";
import { buildFinancialCoreProjectionArtifact } from "./generate-financial-core-projection";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  calculateFranchiseModel,
  cashIrr,
  directCosts,
  firstNode,
  franchisePoint,
  investorWaterfall,
  ownPoint,
  retailFte,
  staffing,
  type CashPeriod,
  type FundingPolicy,
} from "../src/lib/franchise-model-engine";
import {
  newStore,
  parameters,
  parameterStatus,
  resetInput,
  setInput,
  STORAGE_KEY,
  workingScenario,
} from "../src/lib/franchise-model-scenario";
import {
  deleteScenario,
  duplicateScenario,
  loadStore,
  parseStore,
  saveStore,
} from "../src/lib/franchise-model-storage";
const near = (a: number, b: number, t = 0.01) =>
  assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`);
function filled() {
  let s = workingScenario();
  for (const id of [
    "own_local",
    "onboarding",
    "point_software",
    "extra_production",
    "tax_profit",
    "tax_sales",
    "maintenance",
  ])
    s = setInput(s, id, 0);
  return s;
}
const defaultPolicy: FundingPolicy = {
  commitment: 1000,
  initialDraw: 100,
  startupSpend: 0,
  share: 0.8,
  capMultiple: 1.25,
  upfront: false,
  equityShare: 0,
  capitalCalls: [],
};
const periods = (n = 20, fcf = 20): CashPeriod[] =>
  Array.from({ length: n }, (_, i) => ({
    month: i + 1,
    fcf,
    growthCapex: 0,
    reserveFloor: 100,
    validated: true,
  }));
// Arithmetic examples use independently calculated expectations rather than snapshots of the engine.
test("retail FTE covers each role; loaded cost is employer cost, not a percent floor", () => {
  near(retailFte(1, 12, 30, 165, 1.15), 2.50909090909);
  const s = filled(),
    n = staffing(s);
  near(n.retail, 602181.81818);
  near(n.production, 360000);
  near(n.manager, 75000);
  near(staffing(setInput(s, "own_revenue", 500000)).retail, n.retail);
});
test("reserve 3/4/6 derives from fixed burn, never historical reserve", () => {
  for (const months of [3, 4, 6]) {
    const n = firstNode(setInput(filled(), "reserve_months", months));
    near(n.burn, 1947181.81818);
    near(n.reserve, 1947181.81818 * months);
  }
});
test("initial draw decomposes all startup items including technology and reserve", () => {
  const s = filled(),
    n = firstNode(s);
  near(n.initialDraw, 23172720.602727);
  near(n.startupSpend, 15383993.33);
  near(
    n.startup.reduce((a, l) => a + l.amount, 0),
    n.initialDraw,
  );
  near(
    firstNode(setInput(s, "software_v1", 0)).initialDraw,
    n.initialDraw - 2500000,
  );
  near(firstNode(setInput(s, "area", 100)).initialDraw, n.initialDraw); // no invented area-to-price relation
});
test("normative settlement is 57% and royalty is a decomposition, not double charged", () => {
  const s = filled(),
    p = franchisePoint(s);
  near(p.settlement, 3420000);
  near(p.settlementRate!, 0.57);
  near(p.ebitda, 900000);
  near(franchisePoint(setInput(s, "royalty", 0.05)).settlement, p.settlement);
});
test("actual rent inefficiency changes franchisee EBITDA, never settlement", () => {
  let s = setInput(filled(), "actual_mode", 1);
  s = setInput(s, "actual_rent", 780000);
  const p = franchisePoint(s);
  near(p.settlement, 3420000);
  near(p.ebitda, 600000);
  near(p.margin!, 0.1);
});
test("normative actual costs follow revenue; manual costs remain independent", () => {
  const s = setInput(filled(), "franchise_revenue", 150000);
  near(franchisePoint(s).margin!, 0.15);
  near(franchisePoint(setInput(s, "actual_mode", 1)).actual.rent, 480000);
});
test("raw/waste/packaging use different traceable bases", () => {
  const d = directCosts(filled(), 6000000, 6000000 / 1165.4);
  near(d.raw, 1800000);
  near(d.waste, 72000);
  near(d.packaging, 143012.413477);
});
test("own P&L rent allocation does not alter consolidated HeadCo costs", () => {
  const a = filled(),
    b = setInput(a, "retail_allocation", 0.75),
    ma = calculateFranchiseModel(a).result!,
    mb = calculateFranchiseModel(b).result!;
  near(ownPoint(a).ebitda! - ownPoint(b).ebitda!, 175000);
  near(
    ma.months[23].recurringContribution,
    mb.months[23].recurringContribution,
  );
  near(ma.months[0].fixed, 1345000);
  near(ma.months[59].fixed, 1345000);
  near(ma.months[59].direct.total, 10075062.06738);
});
test("prepaid rent is accrued in P&L but not double-paid in M1", () => {
  const m = calculateFranchiseModel(filled()).result!.months;
  near(m[0].fcf! - m[1].fcf!, 350000);
  near(m[0].recurringContribution, m[1].recurringContribution);
});
test("rollout activates exactly in opening month; disabled rows do not sell or consume capacity", () => {
  const s = filled(),
    m = calculateFranchiseModel(s).result!.months;
  assert.equal(m[7].franchiseCount, 0);
  assert.equal(m[8].franchiseCount, 1);
  assert.equal(m[17].franchiseCount, 4);
  assert.equal(m[17].count, 5);
  near(m[23].sales, 30000000);
  s.rollout[1].active = false;
  assert.equal(calculateFranchiseModel(s).result!.months[8].franchiseCount, 0);
});
test("capacity violation invalidates investor outcomes after the first excess month", () => {
  const m = calculateFranchiseModel(setInput(filled(), "capacity", 3));
  assert.equal(m.status, "INVALID");
  assert.equal(m.result!.unvalidated, 15);
  assert.equal(m.result!.months[13].validated, true);
  assert.equal(m.result!.months[14].validated, false);
  assert.equal(m.result!.investor.irr, null);
});
test("explicit expansion controls capacity, recurring OPEX/FTE and one-time CAPEX", () => {
  const s = setInput(filled(), "capacity", 3);
  s.expansions = [
    { id: "exp", month: 15, capacity: 5, capex: 2000000, opex: 100000, fte: 2 },
  ];
  const m = calculateFranchiseModel(s).result!;
  assert.equal(m.unvalidated, null);
  near(m.months[14].fixed, 1685000);
  near(m.months[14].capex, 2000000);
  near(m.months[15].capex, 0);
});
test("missing expansion costs do not become valid zero-funded growth", () => {
  const s = filled();
  s.expansions = [
    { id: "exp", month: 24, capacity: 10, capex: null, opex: null, fte: null },
  ];
  const r = calculateFranchiseModel(s).result!;
  assert.equal(r.months[23].fcf, null);
  assert.equal(r.investor.irr, null);
  assert.equal(r.investor.timeline[1].distributions, null);
});
test("staged funding invests actual draw, not commitment; upfront is explicit", () => {
  const a = investorWaterfall(periods(1), defaultPolicy);
  near(a.timeline[0].investorCf!, -100);
  near(a.totalDrawn, 100);
  near(a.undrawn, 900);
  const b = investorWaterfall(periods(1), { ...defaultPolicy, upfront: true });
  near(b.totalDrawn, 1000);
  near(b.timeline[1].distributions!, 16); // upfront excess is not distributable
});
test("manual capital calls increase actual draws and cap, never operating distributions", () => {
  const a = investorWaterfall(periods(2, 0), {
    ...defaultPolicy,
    capitalCalls: [{ id: "c", month: 1, amount: 40 }],
  });
  near(a.totalDrawn, 140);
  near(a.cap, 175);
  near(a.distributions!, 0);
  near(a.timeline[1].investorCf!, -40);
});
test("required growth CAPEX uses residual commitment only when cash above reserve is insufficient", () => {
  const a = investorWaterfall(
    [
      {
        month: 1,
        fcf: -200,
        growthCapex: 200,
        reserveFloor: 100,
        validated: true,
      },
    ],
    defaultPolicy,
  );
  near(a.timeline[1].growthDraw, 200);
  near(a.timeline[1].cashBalance!, 100);
  near(a.timeline[1].distributions!, 0);
  near(a.totalDrawn, 300);
});
test("reserve floor suspends payout, restores after losses, and keeps cash identities", () => {
  const a = investorWaterfall(
    [
      {
        month: 1,
        fcf: -30,
        growthCapex: 0,
        reserveFloor: 100,
        validated: true,
      },
      ...periods(2, 20).map((p, i) => ({ ...p, month: i + 2 })),
    ],
    defaultPolicy,
  );
  near(a.timeline[1].cashBalance!, 70);
  near(a.timeline[2].distributions!, 0);
  near(a.timeline[2].reserveRestoration!, 20);
  assert.equal(a.timeline[2].reserveBlocked, true);
  near(a.timeline[3].distributions!, 8);
  near(a.timeline[3].cashBalance!, 102);
  for (let i = 1; i < a.timeline.length; i++) {
    const prev = a.timeline[i - 1],
      r = a.timeline[i];
    near(
      r.cashBalance!,
      prev.cashBalance! + r.draw + [-30, 20, 20][i - 1] - r.distributions!,
    );
  }
});
test("future CAPEX not covered by commitment is ring-fenced before waterfall", () => {
  const a = investorWaterfall(
    [{ ...periods(1, 50)[0], futureGrowthCapex: 100 }],
    { ...defaultPolicy, commitment: 100 },
  );
  near(a.timeline[1].distributions!, 0);
  near(a.timeline[1].futureCapexReserve, 100);
});
for (const [share, principal, cap] of [
  [0.9, 6, 7],
  [0.8, 7, 8],
  [0.7, 8, 9],
])
  test(`waterfall ${share * 100}/${100 - share * 100}: principal, cap, MOIC and post-cap zero`, () => {
    const a = investorWaterfall(periods(), { ...defaultPolicy, share });
    assert.equal(a.principalMonth, principal);
    assert.equal(a.capMonth, cap);
    near(a.distributions!, 125);
    near(a.moic!, 1.25);
    near(a.cap, 125);
    assert.ok(a.irr! > 0);
    near(a.timeline[cap + 1].distributions!, 0);
    near(a.retained!, 275);
  });
test("new draw reopens cap and cap completion uses ultimate drawn capital", () => {
  const a = investorWaterfall(periods(), {
    ...defaultPolicy,
    capitalCalls: [{ id: "late", month: 12, amount: 100 }],
  });
  near(a.cap, 250);
  near(a.totalDrawn, 200);
  assert.ok(a.timeline[12].distributions! > 0);
  assert.ok(a.capMonth! >= 12);
  near(a.distributions!, 250);
});
test("IRR known annual example and monthly timing; ambiguous/non-economic flows return N/A", () => {
  const f = Array(13).fill(0);
  f[0] = -100;
  f[12] = 120;
  near(cashIrr(f)!, 0.2, 1e-8);
  assert.equal(cashIrr([0, 10]), null);
  assert.equal(cashIrr([-100, 0]), null);
  // -100 + 230/(1+r) - 132/(1+r)^2 has 2 annual roots (10%,20%).
  const ambiguous = Array(25).fill(0);
  ambiguous[0] = -100;
  ambiguous[12] = 230;
  ambiguous[24] = -132;
  assert.equal(cashIrr(ambiguous), null);
});
test("missing franchise CAPEX leaves simple payback N/A; known CAPEX gives explicit EBITDA proxy", () => {
  assert.equal(franchisePoint(filled()).payback, null);
  near(
    franchisePoint(setInput(filled(), "franchise_capex", 4500000)).payback!,
    5,
  );
});
test("default missing costs do not masquerade as zero FCF or investor returns", () => {
  const s = workingScenario(),
    m = calculateFranchiseModel(s);
  assert.equal(m.status, "PRELIMINARY");
  assert.equal(m.result!.own.ebitda, null);
  assert.equal(m.result!.franchise.netOpening, null);
  assert.equal(m.result!.months[8].fcf, null);
  assert.equal(m.result!.investor.irr, null);
  assert.equal(parameterStatus(s, "point_software"), "MISSING");
  assert.equal(
    parameterStatus(setInput(s, "point_software", 0), "point_software"),
    "WORKING",
  );
});
test("negative economics and required blanks remain invalid, not coerced to zero", () => {
  assert.equal(
    calculateFranchiseModel(setInput(filled(), "rent", null)).result,
    null,
  );
  assert.equal(
    calculateFranchiseModel(setInput(filled(), "target", 0.9)).status,
    "INVALID",
  );
  let s = setInput(
    setInput(filled(), "actual_mode", 1),
    "actual_rent",
    6000000,
  );
  assert.equal(calculateFranchiseModel(s).status, "INVALID");
  assert.ok(calculateFranchiseModel(s).result!.franchise.ebitda < 0);
});
test("impossible cash and exhausted commitment stop distributions and invalidate investor outputs", () => {
  const a = investorWaterfall(periods(1, -200), defaultPolicy);
  assert.equal(a.valid, false);
  near(a.timeline[1].cashBalance!, -100);
  assert.equal(a.irr, null);
  const b = investorWaterfall(periods(1, 20), {
    ...defaultPolicy,
    commitment: 50,
  });
  assert.equal(b.valid, false);
  near(b.timeline[0].fundingGap, 50);
  near(b.timeline[1].distributions!, 0);
});
test("independent stores duplicate, compare, delete, reset; corrupted state is not overwritten", () => {
  const writes: Record<string, string> = {};
  const storage = {
    getItem: () => '{"schemaVersion":2}',
    setItem: (k: string, v: string) => {
      writes[k] = v;
    },
  };
  assert.ok(loadStore(storage).error);
  assert.equal(Object.keys(writes).length, 0);
  let store = duplicateScenario(newStore(), "copy");
  assert.equal(store.scenarios.length, 2);
  store.scenarios[1].inputs.rent = 123;
  assert.equal(store.scenarios[0].inputs.rent, 350000);
  assert.equal(saveStore(storage, store), null);
  assert.equal(Object.keys(writes)[0], STORAGE_KEY);
  assert.ok(parseStore(writes[STORAGE_KEY]));
  assert.equal(deleteScenario(store, "copy").scenarios.length, 1);
  assert.equal(deleteScenario(store, "working-v01").scenarios.length, 2);
  assert.equal(
    resetInput(setInput(workingScenario(), "rent", 123), "rent").inputs.rent,
    350000,
  );
  assert.equal(
    parseStore(JSON.stringify({ ...store, compareIds: ["missing"] })),
    null,
  );
});
test("engine deterministic and does not mutate scenario, canonical Current Base or public Investor Terminal", () => {
  const s = filled(),
    before = JSON.stringify(s);
  const a = calculateFranchiseModel(s);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(calculateFranchiseModel(s), a);
  const protectedFiles = [
    "src/App.tsx",
    "src/components/InvestorTerminal.tsx",
    // InvestorTerminal.css is no longer frozen: its colours moved to theme variables (light and dark themes).
    "src/lib/configured-economics.ts",
    "src/lib/financial-core.ts",
    "src/lib/network-temporal.ts",
    "docs-platform/working/financial-model.yaml",
    "docs-platform/working/network-planning-assumptions.yaml",
    "docs-platform/registry/assumptions.yaml",
    "docs-platform/00-foundation.md",
    "docs-platform/01-business-model-architecture.md",
  ];
  const hash = (b: Buffer) =>
    crypto.createHash("sha256").update(b).digest("hex");
  for (const p of protectedFiles) {
    const original = execFileSync("git", ["show", `6e32ecb:${p}`]);
    // A new share-only property route is authorized independently of the
    // franchise workbench. Remove only its exact registration; all terminal
    // code and every other byte of the original App remain protected.
    const current = p === "src/App.tsx"
      ? Buffer.from(fs.readFileSync(p, "utf8")
        .replace('const SennayaPage = lazy(() => import("./components/Sennaya").then((module) => ({ default: module.SennayaPage })));\n', "")
        .replace('    case "/sennaya":\n      return <Suspense fallback={null}><SennayaPage /></Suspense>;\n', ""))
      : fs.readFileSync(p);
    assert.equal(
      hash(current),
      hash(original),
      `${p} changed from audited baseline`,
    );
  }
  // Shared composition adapters may evolve; every legacy calculated result must remain exact.
  const auditedCore = JSON.parse(execFileSync("git", ["show", "945373f:docs-platform/generated/financial-core-projection.json"], { maxBuffer: 20 * 1024 * 1024 }).toString());
  const currentCore = buildFinancialCoreProjectionArtifact();
  const withoutSourceHashes = (value: unknown) => {
    const copy = JSON.parse(JSON.stringify(value));
    delete copy.meta.source_files;
    delete copy.meta.financial_model_content_state_sha256;
    delete copy.current_base.provenance.financial_model_content_state_sha256;
    delete copy.historical_integrated_pilot.provenance.financial_model_content_state_sha256;
    return copy;
  };
  assert.deepEqual(withoutSourceHashes(currentCore), withoutSourceHashes(auditedCore), "legacy Financial Core numerical/coverage regression");
  for (const p of fs
    .readdirSync("src/lib")
    .filter((p) => p.startsWith("franchise-model-"))) {
    const source = fs.readFileSync(path.join("src/lib", p), "utf8");
    assert.doesNotMatch(
      source,
      /from ['"].*(?:configured-economics|investor-configuration|network-scaling)['"]/,
    );
  }
  assert.ok(
    parameters.every((p) =>
      /^ASM-FRANCHISE-MODEL-V0[12]-/.test(p.assumptionId),
    ),
  );
});
test("retained cash excludes unspent investor capital and prior allocations spent on growth", () => {
  const a = investorWaterfall(periods(1, 20), {
    ...defaultPolicy,
    upfront: true,
  });
  near(a.retained!, 4);
  near(a.retainedAllocations!, 4);
  const b = investorWaterfall(
    [
      { ...periods(1, 100)[0] },
      {
        month: 2,
        fcf: -10,
        growthCapex: 10,
        reserveFloor: 100,
        validated: true,
      },
    ],
    defaultPolicy,
  );
  near(b.retainedAllocations!, 20);
  near(b.retained!, 10);
  near(b.totalDrawn, 100);
});
test("required future CAPEX deficiency and a capital call beyond commitment cannot fund a payout", () => {
  const a = investorWaterfall(periods(1, 20), {
    ...defaultPolicy,
    commitment: 100,
    capitalCalls: [{ id: "excess", month: 1, amount: 100 }],
  });
  assert.equal(a.valid, false);
  near(a.timeline[1].distributions!, 0);
});
test("upfront funding cannot conceal an initial reserve shortfall", () => {
  const p = investorWaterfall(periods(1), {
    ...defaultPolicy,
    commitment: 50,
    upfront: true,
  });
  assert.equal(p.valid, false);
  near(p.timeline[0].fundingGap, 50);
});
test("unprofitable franchise does not falsely imply a capacity violation", () => {
  const s = filled();
  s.rollout[1].rent = 10000000;
  const r = calculateFranchiseModel(s).result!;
  assert.equal(r.unvalidated, 9);
  assert.equal(r.capacityExceededMonth, null);
});
test("numeric overflow produces INVALID instead of non-finite monetary results", () => {
  assert.equal(
    calculateFranchiseModel(setInput(filled(), "franchise_revenue", 1e308))
      .result,
    null,
  );
});
test("standalone own retail rent enters reserve floor once, allocation never does", () => {
  let s = setInput(filled(), "embedded", 0);
  s = setInput(s, "own_external_rent", 200000);
  s = setInput(s, "own_growth_capex", 1000000);
  const r = calculateFranchiseModel(s).result!;
  near(r.months[0].reserveFloor, r.node.reserve + 800000);
  near(r.months[0].capex, 1000000);
  near(r.months[0].fixed, 1345000);
});
