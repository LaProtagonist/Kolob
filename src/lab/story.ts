/**
 * «История сети» — общие данные для всех вариантов визуализации в /lab.
 *
 * Здесь нет ни одной собственной формулы: всё берётся из расчёта раздела
 * «Масштабирование» калькулятора инвестора. Варианты графики получают готовый
 * объект и не обращаются к расчётным модулям напрямую.
 */
import { configuredEconomicsScenario } from "../lib/configured-economics";
import type { InvestorConfiguration, NetworkScalingConfiguration, TradingPointFormat } from "../lib/investor-configuration";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import {
  canonicalTemporalAssumptions,
  locationRentPreset,
  networkRolloutPointsPerDistrict,
  networkRolloutSizeIds,
  type LocationType,
} from "../lib/network-planning";
import { baseObjectFinancialProjection, type NetworkPointCohortProjection, type NetworkScalingItem } from "../lib/network-scaling";

/**
 * Где стоит район. x и y — место на условной карте центра Петербурга в долях от 0 до 1
 * (прежние варианты); lat и lon — та же точка на настоящей карте (широта и долгота).
 */
export type StoryPlace = { id: string; title: string; x: number; y: number; lat: number; lon: number };

export type StoryStaffRole = { name: string; count: number };

/** Часть оснащения точки: кухня, касса, бар, мойка, мебель, форма, стартовый запас. */
export type StoryInventoryGroup = {
  id: string;
  name: string;
  amountRub: number | null;
  /** Состав, если калькулятор знает его по позициям. */
  items: Array<{ name: string; quantity: number | null }>;
};

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
  /** Район (группа точек калькулятора), в котором стоит точка; у первой точки сети — null. */
  districtId: string | null;
  inventory: StoryInventoryGroup[];
};

/**
 * Район — группа одинаковых точек калькулятора. Формат, поток и вложения у всех точек района общие,
 * поэтому район с пустым списком открытий показывает, что получит сеть, если поставить в нём точку.
 */
export type StoryDistrict = {
  id: string;
  title: string;
  place: StoryPlace;
  format: TradingPointFormat;
  formatTitle: string;
  locationType: LocationType;
  /** Месяцы открытия точек района по порядку; пустой список — точек в районе нет. */
  openingMonths: number[];
  checksPerDay: number | null;
  monthlyRevenueRub: number | null;
  /** Вложения в открытие одной точки района. */
  investmentRub: number | null;
  staffTotal: number;
};

/** План открытий района: месяцы, в которые открываются его точки. */
export type StoryPlanEntry = { districtId: string; openingMonths: number[] };

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
  /** Районы, где сеть открывает точки, включая пустые; первая точка сети в этот список не входит. */
  districts: StoryDistrict[];
  /** Правила расчёта, которые нужны для своего плана открытий. */
  rules: {
    /** За сколько месяцев до открытия точки уходят вложения в неё. */
    openingLeadMonths: number;
    /** Больше точек на район расчётные планы сети не открывают. */
    maxPointsPerDistrict: number;
  };
  /** Расчёт по части статей неполный; варианты показывают это одной строкой. */
  isPartial: boolean;
};

// Настоящие места районов выбраны по смыслу их названий в калькуляторе: Лиговский 21 — по адресу,
// Невский — у Гостиного двора, ресторанный центр — улица Рубинштейна, исторический центр — Сенная,
// Коломна — у Никольского собора. Поправить место района — поменять lat и lon здесь.
const places: Record<string, StoryPlace> = {
  "ligovsky-21-flagship": { id: "ligovsky-21-flagship", title: "Лиговский 21", x: 0.74, y: 0.52, lat: 59.9346, lon: 30.3626 },
  "nevsky-premium": { id: "nevsky-premium", title: "Невский", x: 0.5, y: 0.4, lat: 59.9341, lon: 30.3318 },
  "central-high-traffic": { id: "central-high-traffic", title: "Ресторанный центр", x: 0.62, y: 0.66, lat: 59.9297, lon: 30.3447 },
  "historic-center-core": { id: "historic-center-core", title: "Исторический центр", x: 0.42, y: 0.58, lat: 59.9268, lon: 30.3178 },
  "historic-center-value": { id: "historic-center-value", title: "Коломна", x: 0.2, y: 0.7, lat: 59.9228, lon: 30.2985 },
};
// Районы, которых нет в списке выше (группа, собранная в калькуляторе вручную): Петроградка,
// Васильевский, Чернышевская, Технологический институт.
const spare: StoryPlace[] = [
  { id: "spare-1", title: "Новый район", x: 0.3, y: 0.3, lat: 59.9588, lon: 30.3128 },
  { id: "spare-2", title: "Новый район", x: 0.84, y: 0.3, lat: 59.9446, lon: 30.3592 },
  { id: "spare-3", title: "Новый район", x: 0.86, y: 0.78, lat: 59.9168, lon: 30.3186 },
  { id: "spare-4", title: "Новый район", x: 0.12, y: 0.44, lat: 59.9407, lon: 30.2826 },
];

const number = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const inventoryItemIds = ["point-retail-equipment", "point-pos-kds", "point-bar", "point-wash", "furniture", "uniform", "initial-inventory"];
// Те же замены рабочих терминов, что делает калькулятор перед показом посетителю.
const plainName = (value: string) => value.replaceAll("sanitation-kit", "санитарный комплект").replaceAll("cleaning-kit", "санитарный комплект");

/** Оснащение точки — статьи вложений калькулятора как есть, без пересчёта. */
function inventoryOf(items: readonly NetworkScalingItem[]): StoryInventoryGroup[] {
  return items
    .filter((item) => item.included && inventoryItemIds.some((id) => item.id === id || item.id.endsWith(`:${id}`)))
    .map((item) => ({
      id: item.id,
      name: plainName(item.name),
      amountRub: item.amountRub,
      items: (item.detail ?? []).map((detail) => ({ name: plainName(detail.name), quantity: detail.quantity })),
    }));
}

function districtOf(projection: NetworkPointCohortProjection, place: StoryPlace, title: string, openingMonths: number[]): StoryDistrict {
  return {
    id: projection.cohort.id,
    title,
    place,
    format: projection.cohort.format,
    formatTitle: projection.formatName,
    locationType: projection.cohort.locationType,
    openingMonths,
    checksPerDay: projection.operational.sales.checksPerDay,
    monthlyRevenueRub: projection.operational.sales.revenuePerPointRub,
    investmentRub: projection.confirmedPointInvestmentRub,
    staffTotal: projection.operational.staffing.rosterHeadcount,
  };
}

/**
 * Переносит план открытий в настройки калькулятора. У группы точек меняются только количество и месяцы
 * открытия — те же два поля, что правятся в разделе «Масштабирование»; остальное в группе не трогается.
 * Первая точка сети и группы, которых нет в плане, остаются как есть.
 */
export function applyStoryPlan(scaling: NetworkScalingConfiguration, plan: readonly StoryPlanEntry[]): NetworkScalingConfiguration {
  const horizon = canonicalTemporalAssumptions().horizonMonths;
  return {
    ...scaling,
    cohorts: scaling.cohorts.map((cohort, index) => {
      const entry = index === 0 ? undefined : plan.find((item) => item.districtId === cohort.id);
      if (!entry) return cohort;
      const months = entry.openingMonths
        .filter((month) => Number.isFinite(month))
        .map((month) => Math.min(horizon, Math.max(0, Math.floor(month))))
        .sort((left, right) => left - right);
      // Точки, открытые в один месяц, складываются в одну волну — так их хранит калькулятор.
      const openingWaves = [...new Set(months)].map((openingMonth) => ({ openingMonth, count: months.filter((month) => month === openingMonth).length }));
      return { ...cohort, count: months.length, openingWaves };
    }),
  };
}

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
  const districts: StoryDistrict[] = [];
  let spareIndex = 0;
  scaling.cohorts.forEach((projection, cohortIndex) => {
    const cohort = projection.cohort;
    const isBase = cohortIndex === 0;
    const preset = cohort.locationRentPresetId === "custom" ? null : locationRentPreset(cohort.locationRentPresetId);
    const knownPlace: StoryPlace | undefined = preset ? places[preset.id] : undefined;
    if (cohort.count <= 0) {
      // Пустой район остаётся в списке, если его место на карте известно.
      if (!isBase && preset && knownPlace) districts.push(districtOf(projection, knownPlace, preset.shortLabel, []));
      return;
    }
    const place = isBase
      ? places["ligovsky-21-flagship"]
      : knownPlace || spare[spareIndex++ % spare.length];
    const waves = isBase
      ? [{ openingMonth: 0, count: cohort.count }]
      : groups.get(cohort.id)?.openingWaves ?? cohort.openingWaves;
    const staffing = projection.operational.staffing;
    const inventory = inventoryOf(projection.pointItems);
    if (!isBase) {
      districts.push(districtOf(projection, place, preset?.shortLabel ?? place.title, waves.flatMap((wave) => Array.from({ length: wave.count }, () => wave.openingMonth))));
    }
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
          districtId: isBase ? null : cohort.id,
          inventory,
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
    districts,
    rules: {
      openingLeadMonths: canonicalTemporalAssumptions().launchCapexLeadMonths,
      maxPointsPerDistrict: networkRolloutPointsPerDistrict(networkRolloutSizeIds[networkRolloutSizeIds.length - 1]),
    },
    isPartial: temporal.network.isPartial,
  };
}
