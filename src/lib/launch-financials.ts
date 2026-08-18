import financialProjectionJson from "../../docs-platform/generated/financial-model-projection.json";

// Financial Model projection is the master calculation source for the launch-budget financial parameters
// (operating reserve, launch marketing and the other one-off launch items). launch-budget.ts must not
// import this module: docs-platform/app/src/financial/financial-model.ts imports launch-budget.ts for CAPEX,
// so the projection is injected from the page instead of read inside the calculator.
const projection = financialProjectionJson;
const realistic = projection.scenarios.rent.realistic;

export type LaunchFinancials = {
  sourceDocumentId: string;
  contentStateSha256: string;
  scenarioId: string;
  reserveMonths: number;
  operatingReserveRub: number;
  monthlyReserveBaseRub: number;
  monthlyFixedOpexRub: number;
  monthlyScenarioOpexRub: number;
  monthlyLaborRub: number;
  launchMarketingRub: number;
  initialUniformRub: number;
  initialInventoryRub: number;
  videoSurveillanceRub: number;
  alarmRub: number;
  restaurantInvestedCapitalRub: number;
};

const monthlyScenarioOpex = realistic.marketing_rub + realistic.household_rub;
const monthlyReserveBase = realistic.calculated_staffing_labor_rub + realistic.fixed_opex_without_labor_rent_rub + monthlyScenarioOpex;
const reserveMonths = 6;
if (Math.abs(monthlyReserveBase * reserveMonths - realistic.fixed_opex_reserve_rub) > 0.01) {
  throw new Error(`Launch financials: Financial Model reserve ${realistic.fixed_opex_reserve_rub} is not ${reserveMonths} × ${monthlyReserveBase}.`);
}

export const launchFinancials: LaunchFinancials = {
  sourceDocumentId: projection.meta.document_id,
  contentStateSha256: projection.meta.content_state.content_state_sha256,
  scenarioId: realistic.scenario,
  reserveMonths,
  operatingReserveRub: realistic.fixed_opex_reserve_rub,
  monthlyReserveBaseRub: monthlyReserveBase,
  monthlyFixedOpexRub: realistic.fixed_opex_without_labor_rent_rub,
  monthlyScenarioOpexRub: monthlyScenarioOpex,
  monthlyLaborRub: realistic.calculated_staffing_labor_rub,
  launchMarketingRub: realistic.launch_marketing_rub,
  initialUniformRub: realistic.initial_uniform_rub,
  initialInventoryRub: realistic.initial_inventory_rub,
  videoSurveillanceRub: realistic.video_surveillance_rub,
  alarmRub: realistic.alarm_rub,
  restaurantInvestedCapitalRub: realistic.restaurant_invested_capital_rub,
};
