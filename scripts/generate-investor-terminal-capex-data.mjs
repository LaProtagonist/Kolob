import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "src/content/capex-configurator-data.json");
const targetPath = path.join(projectRoot, "src/content/investor-terminal-capex-data.json");
const check = process.argv.includes("--check");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const publicFormatIds = new Set(["FMT-RESTAURANT-SEATING", "FMT-FOOD-COURT"]);
const moduleIds = new Set([
  "MOD-PREP",
  "MOD-POS",
  "MOD-GROW",
  "MOD-BAR",
  "MOD-WASH",
  ...source.formats
    .filter((format) => publicFormatIds.has(format.id))
    .flatMap((format) => [...(format.requiredModules ?? []), ...(format.optionalModules ?? [])]),
  ...source.investorStartModel.point_configuration.required_modules,
  ...source.investorStartModel.point_configuration.optional_modules.map((item) => item.module_id),
]);
const moduleItems = source.moduleItems
  .filter((item) => moduleIds.has(item.moduleId))
  .map((item) => ({
    moduleId: item.moduleId,
    itemId: item.itemId,
    quantityRuleType: item.quantityRuleType,
    quantityRuleValue: item.quantityRuleValue,
    aggregationRule: item.aggregationRule,
    condition: item.condition,
    defaultRequirement: item.defaultRequirement,
  }));
const itemIds = new Set(moduleItems.map((item) => item.itemId));

const terminalStartModel = {
  point_configuration: {
    required_modules: source.investorStartModel.point_configuration.required_modules,
    optional_modules: source.investorStartModel.point_configuration.optional_modules.map((item) => ({
      module_id: item.module_id,
      default_enabled: item.default_enabled,
    })),
    equipment_exclusions: source.investorStartModel.point_configuration.equipment_exclusions.map((item) => ({
      item_id_prefix: item.item_id_prefix,
      item_id: item.item_id,
    })),
  },
  premises: {
    default_scenario: source.investorStartModel.premises.default_scenario,
    scenarios: {
      purchase: { default_purchase_price_rub: source.investorStartModel.premises.scenarios.purchase.default_purchase_price_rub },
      rent: {
        default_monthly_rent_rub: source.investorStartModel.premises.scenarios.rent.default_monthly_rent_rub,
        default_prepayment_months: source.investorStartModel.premises.scenarios.rent.default_prepayment_months,
        default_security_deposit_months: source.investorStartModel.premises.scenarios.rent.default_security_deposit_months,
      },
    },
  },
  area: { defaults: source.investorStartModel.area.defaults },
  seating: {
    default_profile: source.investorStartModel.seating.default_profile,
    profiles: source.investorStartModel.seating.profiles.map((item) => ({ id: item.id, square_metres_per_seat: item.square_metres_per_seat })),
  },
  furniture: {
    default_profile: source.investorStartModel.furniture.default_profile,
    profiles: source.investorStartModel.furniture.profiles.map((item) => ({ id: item.id, rub_per_seat: item.rub_per_seat })),
  },
  equipment: {
    default_scenario: source.investorStartModel.equipment.default_scenario,
    scenarios: source.investorStartModel.equipment.scenarios.map((item) => ({ id: item.id, snapshot_key: item.snapshot_key })),
  },
  preparation: {
    default_mode: source.investorStartModel.preparation.default_mode,
    categories: source.investorStartModel.preparation.categories.map((item) => ({
      id: item.id,
      name: item.name,
      amount_rub: item.amount_rub,
      enabled_by_default: item.enabled_by_default,
    })),
  },
  operating_reserve: {
    default_mode: source.investorStartModel.operating_reserve.default_mode,
    default_months: source.investorStartModel.operating_reserve.default_months,
    default_accordion_open: source.investorStartModel.operating_reserve.default_accordion_open,
    categories: source.investorStartModel.operating_reserve.categories.map((item) => ({
      id: item.id,
      name: item.name,
      amount_rub: item.amount_rub,
    })),
  },
  contingency: { default_percent: source.investorStartModel.contingency.default_percent },
  form: { local_storage_key: source.investorStartModel.form.local_storage_key },
};

const output = {
  // This deliberately omits procurement sources, registry metadata, history,
  // missing sections and non-terminal equipment records. It is the smallest
  // data surface needed by the public Investor Terminal calculations.
  scenarios: source.scenarios.map((item) => ({ id: item.id, label: item.label })),
  businessCapacity: {
    prep_outlet_count: source.businessCapacity.prep_outlet_count,
    checks_per_outlet_per_day: source.businessCapacity.checks_per_outlet_per_day,
  },
  modules: source.modules
    .filter((item) => moduleIds.has(item.id))
    .map((item) => ({ id: item.id, name: item.name, status: item.status })),
  formats: source.formats.filter((item) => publicFormatIds.has(item.id)).map((item) => ({
    id: item.id,
    requiredModules: item.requiredModules,
    optionalModules: item.optionalModules,
  })),
  moduleItems,
  pilotConfiguration: {
    filling_count: source.pilotConfiguration?.filling_count ?? null,
    cashier_post_count: source.pilotConfiguration?.cashier_post_count ?? null,
    hot_kitchen_post_count: source.pilotConfiguration?.hot_kitchen_post_count ?? null,
    service_station_count: source.pilotConfiguration?.service_station_count ?? null,
    central_supply_enabled: source.pilotConfiguration?.central_supply_enabled ?? false,
  },
  investorStartModel: terminalStartModel,
  items: source.items
    .filter((item) => itemIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      scenarios: Object.fromEntries(Object.entries(item.scenarios).map(([scenario, value]) => [scenario, value === null ? null : {
        quantity: value.quantity,
        unitPriceRub: value.unitPriceRub,
      }])),
      inclusionStatus: item.inclusionStatus,
      recordType: item.recordType,
      quoteStatus: item.quoteStatus,
      linkedModuleIds: item.linkedModuleIds,
      sourceModuleId: item.sourceModuleId,
    })),
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (check) {
  const existing = await readFile(targetPath, "utf8").catch(() => "");
  if (existing !== serialized) {
    throw new Error("Investor Terminal CAPEX projection is stale. Run npm run investor:terminal:capex:sync.");
  }
  console.log(`Investor Terminal CAPEX projection is current (${output.items.length} items).`);
} else {
  await writeFile(targetPath, serialized, "utf8");
  console.log(`Wrote ${path.relative(projectRoot, targetPath)} (${output.items.length} items).`);
}
