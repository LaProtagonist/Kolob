import snapshot from "../content/revenue-model-data.json";

export type TrafficMode = "scenario" | "custom";
export type TrafficScenario = "pessimistic" | "realistic" | "optimistic";

export type RevenueModelState = {
  trafficMode: TrafficMode;
  trafficScenario: TrafficScenario;
  customChecksPerDay: number | null;
  /**
   * Runtime-only sales input for a local scenario. The canonical product mix
   * remains the source when this value is null.
   */
  customAverageCheckRub?: number | null;
};

type RevenueScenario = {
  id: TrafficScenario;
  name: string;
  checks_per_day: number;
  capacity_statement: string;
};

export type RevenueModel = typeof snapshot.model & {
  traffic: typeof snapshot.model.traffic & { scenarios: RevenueScenario[] };
};

export const revenueSnapshot = snapshot;
export const revenueModel = snapshot.model as RevenueModel;

export type RevenueCalculation = {
  calculated: boolean;
  scenarioLabel: string;
  checksPerDay: number | null;
  averageCheckRub: number | null;
  foodPortionsPerDay: number | null;
  kolobokPortionsPerDay: number | null;
  manchesPerDay: number | null;
  drinksPerDay: number | null;
  salesPerDayRub: number | null;
  salesPerMonthRub: number | null;
  averageHour: {
    checks: number | null;
    food: number | null;
    kolobok: number | null;
    manches: number | null;
    drinks: number | null;
  };
  peakHour: {
    checks: number | null;
    food: number | null;
    kolobok: number | null;
    manches: number | null;
  };
  maximumHour: {
    checks: number | null;
    food: number | null;
    kolobok: number | null;
    manches: number | null;
  };
  capacityStatement: string;
};

function nonnegativeIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function positiveNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function defaultRevenueModelState(model = revenueModel): RevenueModelState {
  return {
    trafficMode: model.traffic.default_mode as TrafficMode,
    trafficScenario: model.traffic.default_scenario as TrafficScenario,
    customChecksPerDay: model.traffic.custom_default_checks_per_day,
  };
}

export function normalizeRevenueModelState(value: unknown, model = revenueModel): RevenueModelState {
  const defaults = defaultRevenueModelState(model);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<RevenueModelState>;
  const scenarios = new Set(model.traffic.scenarios.map(item => item.id));
  const customAverageCheckRub = positiveNumberOrNull(input.customAverageCheckRub);
  return {
    trafficMode: input.trafficMode === "scenario" || input.trafficMode === "custom" ? input.trafficMode : defaults.trafficMode,
    trafficScenario: scenarios.has(input.trafficScenario as TrafficScenario) ? input.trafficScenario as TrafficScenario : defaults.trafficScenario,
    customChecksPerDay: nonnegativeIntegerOrNull(input.customChecksPerDay),
    ...(customAverageCheckRub === null ? {} : { customAverageCheckRub }),
  };
}

export function resolveChecksPerDay(state: RevenueModelState, model = revenueModel): number | null {
  if (state.trafficMode === "custom") {
    return state.customChecksPerDay !== null && state.customChecksPerDay > 0 ? state.customChecksPerDay : null;
  }
  return model.traffic.scenarios.find(item => item.id === state.trafficScenario)?.checks_per_day ?? null;
}

export function calculateWeightedKolobokPrice(model = revenueModel) {
  return model.product_model.kolobok_price_segments.reduce((sum, item) => sum + item.price_rub * item.share, 0);
}

export function calculateAverageFoodPrice(model = revenueModel) {
  return calculateWeightedKolobokPrice(model) * model.product_model.food_mix.kolobok_share
    + model.product_model.manches.realized_price_rub * model.product_model.food_mix.manches_share;
}

export function calculateAverageCheck(model = revenueModel) {
  return model.product_model.food_portions_per_check * calculateAverageFoodPrice(model)
    + model.product_model.drinks.per_check * model.product_model.drinks.average_price_rub;
}

function emptyLoad() {
  return { checks: null, food: null, kolobok: null, manches: null };
}

function rubCents(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateRevenueModel(state: RevenueModelState, model = revenueModel): RevenueCalculation {
  const checks = resolveChecksPerDay(state, model);
  const scenario = model.traffic.scenarios.find(item => item.id === state.trafficScenario);
  const scenarioLabel = state.trafficMode === "custom" ? model.public_presentation.traffic_mode_labels.custom : scenario?.name ?? "";
  const capacityStatement = state.trafficMode === "custom"
    ? model.public_presentation.production_description
    : scenario?.capacity_statement ?? model.public_presentation.production_description;
  if (checks === null) {
    return {
      calculated: false,
      scenarioLabel,
      checksPerDay: null,
      averageCheckRub: null,
      foodPortionsPerDay: null,
      kolobokPortionsPerDay: null,
      manchesPerDay: null,
      drinksPerDay: null,
      salesPerDayRub: null,
      salesPerMonthRub: null,
      averageHour: { ...emptyLoad(), drinks: null },
      peakHour: emptyLoad(),
      maximumHour: emptyLoad(),
      capacityStatement,
    };
  }

  const product = model.product_model;
  const production = model.production_load;
  const food = checks * product.food_portions_per_check;
  const kolobok = food * product.food_mix.kolobok_share;
  const manches = food * product.food_mix.manches_share;
  const drinks = checks * product.drinks.per_check;
  const averageCheck = state.trafficMode === "custom" && typeof state.customAverageCheckRub === "number" && state.customAverageCheckRub > 0
    ? state.customAverageCheckRub
    : calculateAverageCheck(model);
  const salesPerDayRub = rubCents(checks * averageCheck);
  const peakChecksExact = checks * production.peak_share / production.peak_hours;
  const peakFoodExact = food * production.peak_share / production.peak_hours;
  const maximumChecksExact = peakChecksExact * production.maximum_hour_multiplier;
  const maximumFoodExact = peakFoodExact * production.maximum_hour_multiplier;
  const peakFood = Math.ceil(peakFoodExact);
  const maximumFood = Math.ceil(maximumFoodExact);

  return {
    calculated: true,
    scenarioLabel,
    checksPerDay: checks,
    averageCheckRub: averageCheck,
    foodPortionsPerDay: food,
    kolobokPortionsPerDay: kolobok,
    manchesPerDay: manches,
    drinksPerDay: drinks,
    salesPerDayRub,
    salesPerMonthRub: rubCents(salesPerDayRub * model.sales_calculation.days_per_month),
    averageHour: {
      checks: Math.round(checks / production.trading_hours_per_day),
      food: Math.round(food / production.trading_hours_per_day),
      kolobok: Math.round(kolobok / production.trading_hours_per_day),
      manches: Math.round(manches / production.trading_hours_per_day),
      drinks: Math.round(drinks / production.trading_hours_per_day),
    },
    peakHour: {
      checks: Math.ceil(peakChecksExact),
      food: peakFood,
      kolobok: Math.round(peakFood * product.food_mix.kolobok_share),
      manches: Math.round(peakFood * product.food_mix.manches_share),
    },
    maximumHour: {
      checks: Math.ceil(maximumChecksExact),
      food: maximumFood,
      kolobok: Math.round(maximumFood * product.food_mix.kolobok_share),
      manches: Math.round(maximumFood * product.food_mix.manches_share),
    },
    capacityStatement,
  };
}
