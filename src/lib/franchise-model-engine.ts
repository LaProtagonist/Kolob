/** Pure, standalone management model. All sales are NET of indirect taxes.
 * Does not import Current Base / Investor Terminal / Network Planning adapters.
 * Unknown costs have a separate known-basis subtotal; never become a final FCF.
 */
import { parameters, parameterStatus } from "./franchise-model-scenario";
import type {
  Scenario,
  Point,
  Issue,
  Line,
  Validity,
  InvestorResult,
  WaterfallMonth,
} from "./franchise-model-types";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const EPS = 0.005;
const val = (s: Scenario, k: string): number => {
  const n = s.inputs[k];
  if (n === null || !Number.isFinite(n))
    throw new Error(`Missing required input: ${k}`);
  return n;
};
export const retailFte = (
  positions: number,
  hours: number,
  days: number,
  productiveHours: number,
  coverage: number,
) => ((positions * hours * days) / productiveHours) * coverage;
export function staffing(s: Scenario) {
  const fte = (role: string) =>
    retailFte(
      val(s, role),
      val(s, "hours"),
      val(s, "staff_days"),
      val(s, "fte_hours"),
      val(s, "coverage"),
    );
  const cashier = fte("cashiers"),
    cook = fte("cooks");
  return {
    cashier,
    cook,
    retail: cashier * val(s, "cashier_cost") + cook * val(s, "cook_cost"),
    production: val(s, "production_fte") * val(s, "production_cost"),
    manager: val(s, "manager_fte") * val(s, "manager_cost"),
  };
}
export function firstNode(s: Scenario) {
  const staff = staffing(s);
  const fixed: Line[] = [
    ["Аренда узла", val(s, "rent")],
    ["Производственный штат", staff.production],
    ["Retail: кассир + повар", staff.retail],
    ["Менеджер / технолог", staff.manager],
    ["Коммунальные расходы", val(s, "utilities")],
    ["Центральный маркетинг", val(s, "central_marketing")],
    ["Постоянная логистика", val(s, "fixed_logistics")],
    ["Накладные расходы", val(s, "overhead")],
    ["Регулярное software", val(s, "recurring")],
  ].map(([label, amount]) => ({
    label: String(label),
    amount: Number(amount),
  }));
  const burn = sum(fixed.map((l) => l.amount));
  const reserve = burn * val(s, "reserve_months");
  const ids = [
    "equipment",
    "furniture",
    "fitout",
    "video",
    "alarm",
    "launch",
    "uniforms",
    "inventory",
    "software_v1",
    "computing",
    "other_startup",
  ];
  const startup: Line[] = ids.map((id) => ({
    label: parameters.find((p) => p.id === id)!.label,
    amount: val(s, id),
  }));
  startup.push(
    { label: "Предоплата аренды", amount: val(s, "rent") * val(s, "prepay") },
    { label: "Депозит", amount: val(s, "rent") * val(s, "deposit") },
  );
  const startupSpend = sum(startup.map((l) => l.amount));
  return {
    staff,
    fixed,
    burn,
    reserve,
    startupSpend,
    initialDraw: startupSpend + reserve,
    startup: [...startup, { label: "Операционный резерв", amount: reserve }],
    centralFixed: burn - staff.retail,
  };
}
export function directCosts(s: Scenario, sales: number, checks: number) {
  const raw = sales * val(s, "raw"),
    waste = raw * val(s, "waste"),
    packaging = checks * val(s, "packaging");
  return { raw, waste, packaging, total: raw + waste + packaging };
}
export function pointSales(s: Scenario, type: Point["type"], point?: Point) {
  const own = type === "OWN",
    check =
      point?.averageCheck ?? val(s, own ? "own_check" : "franchise_check");
  const revenueDay =
    point?.revenueDay ??
    (own && val(s, "own_mode") === 1
      ? val(s, "own_checks") * check
      : val(s, own ? "own_revenue" : "franchise_revenue"));
  const days = point?.days ?? val(s, own ? "own_days" : "franchise_days");
  return {
    revenueDay,
    check,
    days,
    checksDay: revenueDay / check,
    checks: (revenueDay / check) * days,
    sales: revenueDay * days,
  };
}
export function franchisePoint(s: Scenario, point?: Point) {
  const revenue = pointSales(s, "FRANCHISE", point),
    sales = revenue.sales;
  const normative = {
    labor: sales * val(s, "norm_labor"),
    rent: sales * val(s, "norm_rent"),
    opex: sales * val(s, "norm_opex"),
    ebitda: sales * val(s, "target"),
  };
  const settlement =
    sales -
    normative.labor -
    normative.rent -
    normative.opex -
    normative.ebitda;
  const actual = {
    labor:
      point?.labor ??
      (val(s, "actual_mode") === 0 ? normative.labor : val(s, "actual_labor")),
    rent:
      point?.rent ??
      (val(s, "actual_mode") === 0 ? normative.rent : val(s, "actual_rent")),
    opex:
      point?.opex ??
      (val(s, "actual_mode") === 0 ? normative.opex : val(s, "actual_opex")),
  };
  const ebitda = sales - actual.labor - actual.rent - actual.opex - settlement;
  const margin = sales > 0 ? ebitda / sales : null;
  const capex = point?.capex ?? s.inputs.franchise_capex;
  const direct = directCosts(s, sales, revenue.checks);
  const marketing = sales * val(s, "network_marketing");
  const centralVariable =
    direct.total +
    marketing +
    val(s, "delivery") +
    val(s, "support") +
    (s.inputs.point_software ?? 0) +
    (s.inputs.extra_production ?? 0);
  const contribution = settlement - centralVariable;
  return {
    ...revenue,
    normative,
    actual,
    settlement,
    settlementRate: sales > 0 ? settlement / sales : null,
    ebitda,
    margin,
    direct,
    marketing,
    centralVariable,
    contribution,
    capex,
    // Management simple EBITDA recovery proxy, explicitly excludes taxes/financing.
    payback: capex !== null && capex > 0 && ebitda > 0 ? capex / ebitda : null,
    health:
      margin === null
        ? "Нет продаж"
        : margin >= 0.15 - EPS / 100
          ? "В пределах рабочей цели"
          : margin >= 0.12 - EPS / 100
            ? "Внимание"
            : "Риск",
    netOpening:
      s.inputs.onboarding === null
        ? null
        : val(s, "entry_fee") - s.inputs.onboarding,
  };
}
export function ownPoint(
  s: Scenario,
  point?: Point,
  embedded = val(s, "embedded") === 1,
) {
  const revenue = pointSales(s, "OWN", point),
    staff = staffing(s),
    direct = directCosts(s, revenue.sales, revenue.checks);
  const labor = point?.labor ?? staff.retail;
  const rent =
    point?.rent ??
    (embedded
      ? val(s, "rent") * val(s, "retail_allocation")
      : s.inputs.own_external_rent);
  const opex = point?.opex ?? s.inputs.own_local;
  const knownEbitda =
    revenue.sales - labor - (rent ?? 0) - (opex ?? 0) - direct.total;
  const ebitda = rent === null || opex === null ? null : knownEbitda;
  const consolidatedBeforeDirect =
    revenue.sales - labor - (opex ?? 0) - (embedded ? 0 : (rent ?? 0));
  return {
    ...revenue,
    labor,
    rent,
    opex,
    direct,
    knownEbitda,
    ebitda,
    margin:
      ebitda === null || revenue.sales === 0 ? null : ebitda / revenue.sales,
    consolidatedBeforeDirect,
    cashContribution: ebitda,
    embedded,
  };
}
export function validateScenario(s: Scenario): Issue[] {
  const issues: Issue[] = [];
  const bad = (id: string, message: string) =>
    issues.push({ id, message, severity: "invalid" });
  for (const p of parameters) {
    const n = s.inputs[p.id];
    if (n === null) {
      if (p.required) bad(p.id, `${p.label}: требуется числовое значение.`);
      continue;
    }
    if (!Number.isFinite(n) || n < p.min || (p.max !== null && n > p.max))
      bad(
        p.id,
        `${p.label}: допустимо ${p.min}${p.max === null ? " и больше" : `–${p.max}`}.`,
      );
    if (
      ["toggle", "mode", "actualMode", "fundingMode"].includes(p.kind) &&
      n !== 0 &&
      n !== 1
    )
      bad(p.id, `${p.label}: недопустимый вариант.`);
  }
  for (const id of ["horizon", "capacity"])
    if (!Number.isInteger(s.inputs[id]))
      bad(
        id,
        `${parameters.find((p) => p.id === id)!.label}: нужно целое число.`,
      );
  const ids = new Set<string>();
  for (const row of [...s.rollout, ...s.expansions, ...s.capitalCalls]) {
    if (!row.id || ids.has(row.id))
      bad("row-id", "У строк должны быть уникальные идентификаторы.");
    ids.add(row.id);
    const minMonth = "amount" in row ? 0 : 1;
    if (!Number.isInteger(row.month) || row.month < minMonth || row.month > 120)
      bad(
        row.id,
        "Месяц события должен быть целым числом в пределах горизонта 0/1–120.",
      );
    if (row.month > (s.inputs.horizon ?? 0))
      issues.push({
        id: row.id,
        severity: "warning",
        message: `Событие M${row.month} вне выбранного горизонта.`,
      });
  }
  for (const p of s.rollout) {
    if (!["OWN", "FRANCHISE"].includes(p.type))
      bad(p.id, "Неизвестный тип точки.");
    for (const key of [
      "revenueDay",
      "averageCheck",
      "days",
      "labor",
      "rent",
      "opex",
      "capex",
    ] as const) {
      const n = p[key];
      if (
        n !== null &&
        (!Number.isFinite(n) ||
          n < 0 ||
          (key === "averageCheck" && n <= 0) ||
          (key === "days" && n > 31))
      )
        bad(p.id, `${p.name}: недопустимое значение ${key}.`);
    }
  }
  const months = new Set<number>();
  for (const e of s.expansions) {
    if (months.has(e.month))
      bad(e.id, "В одном месяце допускается одно событие общей мощности.");
    months.add(e.month);
    if (!Number.isInteger(e.capacity) || e.capacity < 1)
      bad(e.id, "Новая общая мощность должна быть положительным целым числом.");
    for (const k of ["capex", "opex", "fte"] as const)
      if (e[k] !== null && (!Number.isFinite(e[k]) || e[k]! < 0))
        bad(e.id, "Расходы расширения не могут быть отрицательными.");
  }
  for (const c of s.capitalCalls)
    if (c.amount !== null && (!Number.isFinite(c.amount) || c.amount < 0))
      bad(c.id, "Capital call не может быть отрицательным.");
  return issues;
}
/** IRR in log annual-rate space avoids overflow in long monthly CF arrays.
 * Multiple sign changes can have multiple roots: N/A instead of an arbitrary root. */
export function cashIrr(flows: readonly number[]): number | null {
  if (
    !flows.every(Number.isFinite) ||
    !flows.some((x) => x < 0) ||
    !flows.some((x) => x > 0)
  )
    return null;
  const npv = (logRate: number) =>
    flows.reduce((a, c, m) => a + c * Math.exp((-logRate * m) / 12), 0);
  const roots: number[] = [];
  let left = -9.21,
    fl = npv(left);
  for (let i = 1; i <= 500; i++) {
    const right = -9.21 + i * (23.03 / 500),
      fr = npv(right);
    if (fl * fr < 0) {
      let lo = left,
        hi = right,
        base = fl;
      for (let n = 0; n < 100; n++) {
        const mid = (lo + hi) / 2,
          f = npv(mid);
        if (base * f <= 0) hi = mid;
        else {
          lo = mid;
          base = f;
        }
      }
      roots.push(Math.expm1((lo + hi) / 2));
    }
    if (fr === 0) roots.push(Math.expm1(right));
    left = right;
    fl = fr;
  }
  return roots.length === 1 ? roots[0] : null;
}
export type CashPeriod = {
  month: number;
  fcf: number | null;
  growthCapex: number;
  reserveFloor: number;
  validated: boolean;
  futureGrowthCapex?: number;
};
export type FundingPolicy = {
  commitment: number;
  initialDraw: number;
  startupSpend: number;
  share: number;
  capMultiple: number;
  upfront: boolean;
  equityShare: number | null;
  capitalCalls: Scenario["capitalCalls"];
};
export function investorWaterfall(
  periods: CashPeriod[],
  p: FundingPolicy,
): InvestorResult {
  const issues: Issue[] = [];
  const manual = (month: number) =>
    sum(
      p.capitalCalls.filter((c) => c.month === month).map((c) => c.amount ?? 0),
    );
  const unknownCall = p.capitalCalls.some(
    (c) => c.month <= (periods.at(-1)?.month ?? 0) && c.amount === null,
  );
  const requested =
    Math.max(p.initialDraw, p.upfront ? p.commitment : p.initialDraw) +
    manual(0);
  let drawn = Math.min(p.commitment, requested),
    distributions = 0,
    retained = 0;
  let balance = drawn - p.startupSpend;
  let remainingFundedCash = balance;
  let complete = !unknownCall && p.equityShare !== null;
  let valid = requested <= p.commitment + EPS;
  if (!valid)
    issues.push({
      id: "initial-funding",
      severity: "invalid",
      month: 0,
      message:
        "Первоначальный draw / capital call превышает commitment. Требуется дополнительное обязательство финансирования.",
    });
  if (unknownCall)
    issues.push({
      id: "missing-call",
      severity: "missing",
      message: "Не определена сумма capital call.",
    });
  const timeline: WaterfallMonth[] = [
    {
      month: 0,
      draw: drawn,
      growthDraw: 0,
      distributions: 0,
      investorCf: -drawn,
      retained: 0,
      cashBalance: balance,
      reserveFloor: p.initialDraw - p.startupSpend,
      reserveRestoration: 0,
      distributable: 0,
      totalDrawn: drawn,
      cumulativeDistributions: 0,
      cap: drawn * p.capMultiple,
      fundingGap: Math.max(0, requested - p.commitment),
      futureCapexReserve: 0,
      reserveBlocked: false,
      validated: valid,
    },
  ];
  for (const row of periods) {
    const requestedManual = manual(row.month),
      call = Math.min(requestedManual, Math.max(0, p.commitment - drawn));
    let gap = requestedManual - call;
    if (row.fcf === null) complete = false;
    if (!row.validated) valid = false;
    let futureCapexReserve = 0;
    let auto = 0,
      payout: number | null = null,
      kept: number | null = null,
      available: number | null = null,
      restoration: number | null = null;
    if (complete && row.fcf !== null) {
      // Automatic funding only for required growth CAPEX, never to cover operating losses.
      const needed = Math.min(
        row.growthCapex,
        Math.max(0, row.reserveFloor - (balance + call + row.fcf)),
      );
      auto = Math.min(needed, Math.max(0, p.commitment - drawn - call));
      gap += needed - auto;
      if (gap > EPS) valid = false;
      restoration = Math.min(
        Math.max(0, row.fcf),
        Math.max(0, row.reserveFloor - balance - call - auto),
      );
      const earnedBefore = Math.max(0, balance - remainingFundedCash);
      remainingFundedCash += call + auto;
      if (row.fcf < 0)
        remainingFundedCash = Math.max(
          0,
          remainingFundedCash - Math.max(0, -row.fcf - earnedBefore),
        );
      balance += call + auto + row.fcf;
      if (balance < -EPS) {
        valid = false;
        issues.push({
          id: `cash-${row.month}`,
          severity: "invalid",
          month: row.month,
          message: `M${row.month}: отрицательный остаток денежных средств; требуется финансирование.`,
        });
      }
      futureCapexReserve = Math.max(
        0,
        (row.futureGrowthCapex ?? 0) -
          Math.max(0, p.commitment - drawn - call - auto),
      );
      available = Math.min(
        Math.max(0, row.fcf),
        Math.max(0, balance - row.reserveFloor - futureCapexReserve),
      );
      const cap = (drawn + call + auto) * p.capMultiple;
      const remaining = Math.max(0, cap - distributions);
      // No payout after the first invalid month. Pending cash remains in company.
      payout = valid ? Math.min(p.share * available, remaining) : 0;
      if (valid && remaining <= EPS) payout = (p.equityShare ?? 0) * available;
      kept = available - payout;
      distributions += payout;
      retained += kept;
      balance -= payout;
    }
    if (gap > EPS) {
      valid = false;
      issues.push({
        id: `funding-${row.month}`,
        severity: "invalid",
        month: row.month,
        message: `M${row.month}: недостаточно commitment для запрошенного draw.`,
      });
    }
    drawn += call + auto;
    timeline.push({
      month: row.month,
      draw: call + auto,
      growthDraw: auto,
      distributions: payout,
      investorCf: payout === null ? null : payout - call - auto,
      retained: kept,
      cashBalance: complete ? balance : null,
      reserveFloor: row.reserveFloor,
      reserveRestoration: restoration,
      distributable: available,
      totalDrawn: drawn,
      cumulativeDistributions: complete ? distributions : null,
      cap: drawn * p.capMultiple,
      fundingGap: gap,
      futureCapexReserve,
      reserveBlocked:
        complete &&
        row.fcf !== null &&
        row.fcf > 0 &&
        (available ?? 0) < row.fcf - EPS,
      validated: valid && complete,
    });
  }
  const ready = complete && valid;
  const principal =
    timeline.find(
      (r) =>
        r.totalDrawn > 0 &&
        (r.cumulativeDistributions ?? -1) >= r.totalDrawn - EPS,
    )?.month ?? null;
  const capMonth =
    timeline.find(
      (r) =>
        r.totalDrawn >= drawn - EPS &&
        r.totalDrawn > 0 &&
        (r.cumulativeDistributions ?? -1) >= drawn * p.capMultiple - EPS,
    )?.month ?? null;
  return {
    timeline,
    totalDrawn: drawn,
    undrawn: Math.max(0, p.commitment - drawn),
    distributions: ready ? distributions : null,
    outstanding: ready ? Math.max(0, drawn - distributions) : null,
    principalMonth: ready ? principal : null,
    capMonth: ready ? capMonth : null,
    cap: drawn * p.capMultiple,
    irr: ready ? cashIrr(timeline.map((r) => r.investorCf!)) : null,
    moic: ready && drawn > 0 ? distributions / drawn : null,
    retained: ready
      ? Math.max(
          0,
          balance -
            Math.max(
              remainingFundedCash,
              periods.at(-1)?.reserveFloor ?? p.initialDraw - p.startupSpend,
            ),
        )
      : null,
    retainedAllocations: ready ? retained : null,
    coverage:
      ready && drawn > 0 ? distributions / (drawn * p.capMultiple) : null,
    valid,
    completeInputs: complete,
    issues,
  };
}
export type NetworkMonth = Record<
  | "month"
  | "ownCount"
  | "franchiseCount"
  | "count"
  | "sales"
  | "ownSales"
  | "franchiseSales"
  | "checks"
  | "settlements"
  | "grossFees"
  | "cashInflow"
  | "ownContribution"
  | "marketing"
  | "delivery"
  | "support"
  | "pointSoftware"
  | "extraProduction"
  | "fixed"
  | "recurringContribution"
  | "franchiseEbitda"
  | "capex"
  | "knownFcf"
  | "prepaidRentCredit"
  | "capacity"
  | "utilisation"
  | "reserveFloor",
  number
> & {
  direct: ReturnType<typeof directCosts>;
  margin: number | null;
  fixedPerPoint: number | null;
  fixedShare: number | null;
  tax: number | null;
  netFees: number | null;
  fcf: number | null;
  validated: boolean;
};
export function calculateFranchiseModel(s: Scenario) {
  const issues = validateScenario(s);
  if (issues.some((i) => i.severity === "invalid"))
    return { status: "INVALID" as Validity, issues, result: null };
  const node = firstNode(s),
    own = ownPoint(s),
    franchise = franchisePoint(s);
  const missing = (id: string, message: string, month?: number) => {
    if (!issues.some((i) => i.id === id && i.month === month))
      issues.push({ id, severity: "missing", message, month });
  };
  const invalid = (id: string, message: string, month?: number) =>
    issues.push({ id, severity: "invalid", message, month });
  if (franchise.settlement < -EPS)
    invalid(
      "settlement",
      "Нормативы дают отрицательный центральный расчётный поток.",
    );
  if (franchise.ebitda < -EPS)
    invalid("franchise-ebitda", "Фактическая EBITDA франчайзи отрицательна.");
  if (val(s, "royalty") > (franchise.settlementRate ?? 0) + EPS)
    invalid("royalty", "Выделенная доля роялти превышает central settlement.");
  if (s.inputs.franchise_capex === null)
    missing(
      "franchise_capex",
      "Для расчёта срока возврата инвестиций франчайзи необходимо определить CAPEX точки.",
    );
  const commonMissing = [
    "tax_profit",
    "tax_sales",
    "maintenance",
    "point_software",
    "extra_production",
  ].filter(
    (id) => s.inputs[id] === null || parameterStatus(s, id) === "MISSING",
  );
  for (const id of commonMissing)
    missing(
      id,
      `${parameters.find((p) => p.id === id)!.label}: необходимо определить для полного HeadCo FCF и инвесторского расчёта.`,
    );
  if (s.inputs.onboarding === null)
    missing(
      "onboarding",
      "Стоимость открытия франчайзи не определена: net opening contribution = N/A.",
    );
  if (s.inputs.own_local === null)
    missing("own_local", "Локальный OPEX собственной точки не определён.");
  if (val(s, "equity") === 1 && s.inputs.post_cap_share === null)
    missing("post_cap_share", "При equity требуется доля инвестора после cap.");
  issues.push(
    {
      id: "software-warning",
      severity: "warning",
      message:
        "Полная стоимость сопровождения software/platform ещё не подтверждена.",
    },
    {
      id: "central-warning",
      severity: "warning",
      message:
        "Часть центральных расходов пока использует временные рабочие значения либо отсутствует. HeadCo contribution является предварительным.",
    },
    {
      id: "capacity-working",
      severity: "warning",
      message:
        "Мощность — рабочая гипотеза; не подтверждена технологическими испытаниями.",
    },
  );
  const firstOwn = s.rollout
    .filter((p) => p.active && p.type === "OWN")
    .sort((a, b) => a.month - b.month)[0]?.id;
  let capacity = val(s, "capacity"),
    addedOpex = 0,
    addedFte = 0,
    unvalidated: number | null = null,
    capacityExceededMonth: number | null = null,
    unknownExpansion = false;
  const months: NetworkMonth[] = [];
  for (let month = 1; month <= val(s, "horizon"); month++) {
    const events = s.expansions.filter((e) => e.month === month);
    for (const e of events) {
      capacity = e.capacity;
      addedOpex += e.opex ?? 0;
      addedFte += e.fte ?? 0;
      if (e.capex === null || e.opex === null || e.fte === null) {
        unknownExpansion = true;
        missing(
          e.id,
          `M${month}: заполните CAPEX, OPEX и FTE расширения.`,
          month,
        );
      }
    }
    const active = s.rollout.filter((p) => p.active && p.month <= month);
    const ownRows = active.filter((p) => p.type === "OWN"),
      franchiseRows = active.filter((p) => p.type === "FRANCHISE");
    const ownModels = ownRows.map((p) =>
      ownPoint(s, p, p.id === firstOwn && val(s, "embedded") === 1),
    );
    const franchiseModels = franchiseRows.map((p) => franchisePoint(s, p));
    const openingFranchise = franchiseRows.filter(
      (p) => p.month === month,
    ).length;
    const ownGrowth = ownRows.filter(
      (p) =>
        p.month === month && (p.id !== firstOwn || val(s, "embedded") === 0),
    );
    if (active.length > capacity && capacityExceededMonth === null) {
      capacityExceededMonth = month;
      unvalidated ??= month;
      invalid(
        "capacity-exceeded",
        `CAPACITY EXCEEDED: M${month}, ${active.length} точек при мощности ${capacity}. С этого месяца результаты сети и инвестора не валидированы.`,
        month,
      );
    }
    if (
      franchiseModels.some((p) => p.ebitda < -EPS || p.settlement < -EPS) &&
      unvalidated === null
    ) {
      unvalidated = month;
      invalid(
        "point-economics",
        `M${month}: отрицательная экономика одной из точек.`,
        month,
      );
    }
    const sales = sum([...ownModels, ...franchiseModels].map((p) => p.sales));
    const checks = sum([...ownModels, ...franchiseModels].map((p) => p.checks));
    const direct = directCosts(s, sales, checks);
    const ownSales = sum(ownModels.map((p) => p.sales)),
      franchiseSales = sum(franchiseModels.map((p) => p.sales));
    const settlements = sum(franchiseModels.map((p) => p.settlement)),
      grossFees = openingFranchise * val(s, "entry_fee");
    const cashInflow = ownSales + settlements + grossFees;
    const ownContribution = sum(
      ownModels.map((p) => p.consolidatedBeforeDirect),
    );
    const fixed =
      node.centralFixed + addedOpex + addedFte * val(s, "production_cost");
    const marketing = franchiseSales * val(s, "network_marketing"),
      delivery = franchiseRows.length * val(s, "delivery"),
      support = franchiseRows.length * val(s, "support");
    const pointSoftware = active.length * (s.inputs.point_software ?? 0),
      extraProduction = active.length * (s.inputs.extra_production ?? 0);
    const recurringContribution =
      ownContribution +
      settlements -
      direct.total -
      marketing -
      delivery -
      support -
      pointSoftware -
      extraProduction -
      fixed;
    const capex =
      sum(events.map((e) => e.capex ?? 0)) +
      sum(ownGrowth.map((p) => p.capex ?? s.inputs.own_growth_capex ?? 0));
    const netFees =
      s.inputs.onboarding === null && openingFranchise > 0
        ? null
        : grossFees - openingFranchise * (s.inputs.onboarding ?? 0);
    const incomeKnown = recurringContribution + (netFees ?? grossFees);
    const tax =
      s.inputs.tax_profit === null || s.inputs.tax_sales === null
        ? null
        : Math.max(
            Math.max(0, incomeKnown) * s.inputs.tax_profit,
            cashInflow * s.inputs.tax_sales,
          );
    // Prepaid rent was already funded in M0: accrual rent stays in EBITDA, cash is not paid twice.
    const prepaidRentCredit =
      Math.max(0, Math.min(1, val(s, "prepay") - (month - 1))) * val(s, "rent");
    const knownFcf =
      incomeKnown -
      (tax ?? 0) -
      (s.inputs.maintenance ?? 0) -
      capex +
      prepaidRentCredit;
    const missingOwn = ownModels.some(
      (p) => p.opex === null || p.rent === null,
    );
    const missingOwnCapex = ownGrowth.some(
      (p) => p.capex === null && s.inputs.own_growth_capex === null,
    );
    if (missingOwnCapex)
      missing(
        "own_growth_capex",
        `M${month}: требуется CAPEX дополнительной собственной точки.`,
        month,
      );
    if (ownModels.some((p) => p.rent === null))
      missing(
        "own_external_rent",
        "Требуется аренда отдельно стоящей / дополнительной собственной точки.",
      );
    const complete =
      commonMissing.length === 0 &&
      !missingOwn &&
      !unknownExpansion &&
      !missingOwnCapex &&
      netFees !== null;
    const fcf = complete ? knownFcf : null;
    const reserveFloor =
      (fixed +
        Math.max(node.staff.retail, sum(ownModels.map((p) => p.labor))) +
        sum(ownModels.filter((p) => !p.embedded).map((p) => p.rent ?? 0))) *
      val(s, "reserve_months");
    months.push({
      month,
      ownCount: ownRows.length,
      franchiseCount: franchiseRows.length,
      count: active.length,
      sales,
      ownSales,
      franchiseSales,
      checks,
      settlements,
      grossFees,
      netFees,
      cashInflow,
      ownContribution,
      direct,
      marketing,
      delivery,
      support,
      pointSoftware,
      extraProduction,
      fixed,
      recurringContribution,
      margin: sales > 0 ? recurringContribution / sales : null,
      franchiseEbitda: sum(franchiseModels.map((p) => p.ebitda)),
      capex,
      tax,
      knownFcf,
      fcf,
      prepaidRentCredit,
      capacity,
      utilisation: active.length / capacity,
      fixedPerPoint: active.length > 0 ? fixed / active.length : null,
      fixedShare: sales > 0 ? fixed / sales : null,
      reserveFloor,
      validated: unvalidated === null,
    });
  }
  const finiteResults = (value: unknown): boolean => {
    if (typeof value === "number") return Number.isFinite(value);
    if (value && typeof value === "object")
      return Object.values(value).every(finiteResults);
    return true;
  };
  if (!finiteResults({ node, own, franchise, months })) {
    invalid(
      "numeric-overflow",
      "Значения превышают числовой диапазон расчёта. Уменьшите входные значения.",
    );
    return { status: "INVALID" as Validity, issues, result: null };
  }
  const unknownFutureGrowth =
    s.expansions.some(
      (e) =>
        e.month <= val(s, "horizon") &&
        (e.capex === null || e.opex === null || e.fte === null),
    ) ||
    s.rollout.some(
      (p) =>
        p.active &&
        p.type === "OWN" &&
        (p.id !== firstOwn || val(s, "embedded") === 0) &&
        p.month <= val(s, "horizon") &&
        p.capex === null &&
        s.inputs.own_growth_capex === null,
    );
  const investor = investorWaterfall(
    months.map((m) => ({
      month: m.month,
      fcf: unknownFutureGrowth ? null : m.fcf,
      growthCapex: m.capex,
      reserveFloor: m.reserveFloor,
      futureGrowthCapex: sum(
        months.filter((n) => n.month > m.month).map((n) => n.capex),
      ),
      validated:
        m.validated &&
        !issues.some((i) => i.severity === "invalid" && i.month === undefined),
    })),
    {
      commitment: val(s, "commitment"),
      initialDraw: node.initialDraw,
      startupSpend: node.startupSpend,
      share: val(s, "share"),
      capMultiple: val(s, "return_cap"),
      upfront: val(s, "funding_mode") === 1,
      equityShare: val(s, "equity") === 0 ? 0 : s.inputs.post_cap_share,
      capitalCalls: s.capitalCalls,
    },
  );
  issues.push(...investor.issues);
  const status: Validity = issues.some((i) => i.severity === "invalid")
    ? "INVALID"
    : issues.length ||
        parameters.some((p) => parameterStatus(s, p.id) !== "CONFIRMED")
      ? "PRELIMINARY"
      : "COMPLETE";
  return {
    status,
    issues,
    result: {
      node,
      own,
      franchise,
      months,
      investor,
      unvalidated,
      capacityExceededMonth,
    },
  };
}
export type Model = ReturnType<typeof calculateFranchiseModel>;
