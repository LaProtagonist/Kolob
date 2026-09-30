/**
 * «История сети» — общие данные для всех вариантов визуализации в /lab.
 *
 * Здесь нет ни одной собственной формулы: всё берётся из расчёта раздела
 * «Масштабирование» калькулятора инвестора. Варианты графики получают готовый
 * объект и не обращаются к расчётным модулям напрямую.
 */
import { configuredEconomicsScenario } from "../lib/configured-economics";
import type { InvestorConfiguration, TradingPointFormat } from "../lib/investor-configuration";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import { locationRentPreset, type LocationType } from "../lib/network-planning";
import { baseObjectFinancialProjection } from "../lib/network-scaling";

/** Координаты района на условной карте центра Петербурга, в долях от 0 до 1. */
export type StoryPlace = { id: string; title: string; x: number; y: number };

export type StoryStaffRole = { name: string; count: number };

export type StoryPoint = {
  id: string;
  /** Короткое название района или «Лиговский 21» для первой точки. */
  title: string;
  place: StoryPlace;
  /** Первая точка сети, совмещённая с заготовочным производством. */
  isBase: boolean;
  format: TradingPointFormat;
  formatTitle: string;
  locationType: LocationType;
  areaM2: number | null;
  seats: number | null;
  barEnabled: boolean;
  /** Месяц открытия от старта программы; первая точка открыта с нулевого месяца. */
  openingMonth: number;
  checksPerDay: number | null;
  monthlyRevenueRub: number | null;
  /** Вложения в открытие этой точки; у первой точки — вместе с производством. */
  investmentRub: number | null;
  staffOnShift: number;
  staffTotal: number;
  staffRoles: StoryStaffRole[];
};

export type StoryMonth = {
  month: number;
  /** Календарный месяц 1–12. */
  calendarMonth: number;
  openPoints: number;
  newOpenings: number;
  staffTotal: number;
  revenueRub: number;
  ebitdaRub: number;
  /** Вложения этого месяца: открытие точек и резерв. */
  investedRub: number;
  cashFlowRub: number;
  cumulativeCashRub: number;
};

export type NetworkStory = {
  points: StoryPoint[];
  months: StoryMonth[];
  totals: {
    pointCount: number;
    investmentRub: number | null;
    /** Месяц, когда накопленные деньги сети выходят в плюс; null — за горизонтом расчёта. */
    paybackMonth: number | null;
    /** Месяц, когда открыта последняя точка. */
    lastOpeningMonth: number | null;
    /** Месяц, когда все точки вышли на плановую выручку. */
    fullScaleMonth: number | null;
    horizonMonths: number;
    /** Самая глубокая точка накопленных денег — столько нужно профинансировать. */
    peakFundingRub: number;
  };
  /** Расчёт по части статей неполный; варианты показывают это одной строкой. */
  isPartial: boolean;
};

const places: Record<string, StoryPlace> = {
  "ligovsky-21-flagship": { id: "ligovsky-21-flagship", title: "Лиговский 21", x: 0.74, y: 0.52 },
  "nevsky-premium": { id: "nevsky-premium", title: "Невский", x: 0.5, y: 0.4 },
  "central-high-traffic": { id: "central-high-traffic", title: "Ресторанный центр", x: 0.62, y: 0.66 },
  "historic-center-core": { id: "historic-center-core", title: "Исторический центр", x: 0.42, y: 0.58 },
  "historic-center-value": { id: "historic-center-value", title: "Коломна", x: 0.2, y: 0.7 },
};
const spare: StoryPlace[] = [
  { id: "spare-1", title: "Новый район", x: 0.3, y: 0.3 },
  { id: "spare-2", title: "Новый район", x: 0.84, y: 0.3 },
  { id: "spare-3", title: "Новый район", x: 0.86, y: 0.78 },
  { id: "spare-4", title: "Новый район", x: 0.12, y: 0.44 },
];

const number = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function buildNetworkStory(configuration: InvestorConfiguration): NetworkStory {
  const scenario = configuredEconomicsScenario(configuration);
  const baseObject = {
    ...baseObjectFinancialProjection(scenario),
    investmentBreakdown: scenario.investmentBreakdown,
    cashFlows: scenario.cashFlows,
    monthlyProjection: scenario.monthlyProjection,
  };
  const { scaling, temporal } = networkFinancialProjection(configuration, baseObject, baseObject);
  const groups = new Map(temporal.expansion.groups.map((group) => [group.cohortId, group]));

  const points: StoryPoint[] = [];
  let spareIndex = 0;
  scaling.cohorts.forEach((projection, cohortIndex) => {
    const cohort = projection.cohort;
    if (cohort.count <= 0) return;
    const isBase = cohortIndex === 0;
    const preset = cohort.locationRentPresetId === "custom" ? null : locationRentPreset(cohort.locationRentPresetId);
    const place = isBase
      ? places["ligovsky-21-flagship"]
      : (preset && places[preset.id]) || spare[spareIndex++ % spare.length];
    const waves = isBase
      ? [{ openingMonth: 0, count: cohort.count }]
      : groups.get(cohort.id)?.openingWaves ?? cohort.openingWaves;
    const staffing = projection.operational.staffing;
    let ordinal = 0;
    for (const wave of waves) {
      for (let copy = 0; copy < wave.count; copy += 1) {
        ordinal += 1;
        points.push({
          id: `${cohort.id}#${ordinal}`,
          title: isBase ? places["ligovsky-21-flagship"].title : preset?.shortLabel ?? place.title,
          // Несколько точек одного района расходятся по кругу, чтобы не лежать друг на друге.
          place: ordinal === 1 ? place : { ...place, x: place.x + 0.05 * Math.cos(ordinal * 2.1), y: place.y + 0.05 * Math.sin(ordinal * 2.1) },
          isBase,
          format: cohort.format,
          formatTitle: projection.formatName,
          locationType: cohort.locationType,
          areaM2: cohort.totalAreaM2,
          seats: cohort.format === "with_seating" ? cohort.approvedSeatCount : null,
          barEnabled: cohort.barEnabled,
          openingMonth: wave.openingMonth,
          checksPerDay: projection.operational.sales.checksPerDay,
          monthlyRevenueRub: isBase ? scenario.salesPerMonthRub : projection.operational.sales.revenuePerPointRub,
          investmentRub: isBase ? scenario.startInvestmentRub : projection.confirmedPointInvestmentRub,
          staffOnShift: staffing.concurrentStaff,
          staffTotal: staffing.rosterHeadcount,
          staffRoles: staffing.roles.map((role) => ({ name: role.name, count: role.rosterHeadcount })),
        });
      }
    }
  });
  points.sort((left, right) => left.openingMonth - right.openingMonth);

  let peakFundingRub = 0;
  const months: StoryMonth[] = temporal.network.months.map((month) => {
    const open = points.filter((point) => point.openingMonth <= month.month);
    const cumulativeCashRub = number(month.cumulativeCashFlowRub);
    peakFundingRub = Math.min(peakFundingRub, cumulativeCashRub);
    return {
      month: month.month,
      calendarMonth: month.calendarMonth,
      openPoints: open.length,
      newOpenings: points.filter((point) => point.openingMonth === month.month).length,
      staffTotal: open.reduce((total, point) => total + point.staffTotal, 0),
      revenueRub: number(month.revenueRub),
      ebitdaRub: number(month.ebitdaRub),
      investedRub: number(month.capexRub) + number(month.operatingReserveRub),
      cashFlowRub: number(month.cashFlowRub),
      cumulativeCashRub,
    };
  });

  return {
    points,
    months,
    totals: {
      pointCount: points.length,
      investmentRub: temporal.network.investmentRub,
      paybackMonth: temporal.network.paybackMonth,
      lastOpeningMonth: temporal.lastOpeningMonth,
      fullScaleMonth: temporal.fullScaleMonth,
      horizonMonths: temporal.horizonMonths,
      peakFundingRub: Math.abs(peakFundingRub),
    },
    isPartial: temporal.network.isPartial,
  };
}
