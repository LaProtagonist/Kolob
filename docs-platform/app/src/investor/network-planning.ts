import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { canonical, sha256 } from "../governance/util.js";
import { readFinancialModel } from "../financial/financial-model.js";
import { readRevenueModel } from "./revenue-model.js";

const projectRoot = path.resolve(platformRoot, "..");

export const NETWORK_PLANNING_PATH = "docs-platform/working/network-planning-assumptions.yaml";
export const NETWORK_PLANNING_SCHEMA_PATH = "docs-platform/schemas/network-planning-assumptions.schema.json";
export const NETWORK_PLANNING_SNAPSHOT_PATH = "src/content/network-planning-data.json";
export const NETWORK_PLANNING_SNAPSHOT_SCHEMA_VERSION = 1;

export const NETWORK_PLANNING_SOURCE_PATHS = [
  NETWORK_PLANNING_PATH,
  NETWORK_PLANNING_SCHEMA_PATH,
  "docs-platform/working/financial-model.yaml",
  "docs-platform/working/revenue-model.yaml",
  "docs-platform/registry/sources.yaml",
  "docs-platform/working/capex-equipment-register.yaml",
  "src/content/capex-configurator-data.json",
  "src/lib/physical-allocation.ts",
  "src/lib/employer-contributions.ts",
  "docs-platform/app/src/investor/network-planning.ts",
] as const;

type SourcePath = typeof NETWORK_PLANNING_SOURCE_PATHS[number];

function normalizedSource(relativePath: string, bytes: string | Buffer) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n").normalize("NFC");
  return relativePath.endsWith(".yaml") || relativePath.endsWith(".json") ? canonical(YAML.parse(text)) : text;
}

export function buildNetworkPlanningContentState(root = projectRoot, overrides: Partial<Record<SourcePath, string | Buffer>> = {}) {
  const sourceFiles = NETWORK_PLANNING_SOURCE_PATHS.map(file => ({
    path: file,
    sha256: sha256(normalizedSource(file, overrides[file] ?? fs.readFileSync(path.join(root, file)))),
  }));
  const input = { schema_version: 1, source_files: sourceFiles };
  return { ...input, content_state_sha256: sha256(canonical(input)) };
}

export function readNetworkPlanningModel(root = projectRoot): any {
  return YAML.parse(fs.readFileSync(path.join(root, NETWORK_PLANNING_PATH), "utf8"));
}

export function validateNetworkPlanningModel(model = readNetworkPlanningModel()): string[] {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, NETWORK_PLANNING_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const errors = validate(model) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
  if (model.references?.financial_model !== "docs-platform/working/financial-model.yaml") errors.push("Planning model must reference the canonical Financial Model.");
  if (model.references?.physical_allocation !== "src/lib/physical-allocation.ts") errors.push("Planning model must reference the physical allocation map.");
  if (model.launch?.initial_inventory_operating_days !== 3) errors.push("Planning initial inventory must default to three operating days.");
  const baseFlagship = model.base_object?.flagship_reference;
  if (baseFlagship?.preset_id !== "ligovsky-21-flagship" || baseFlagship?.monthly_rent_rub !== 500000 || baseFlagship?.rent_free_months !== 2 || baseFlagship?.historical_financial_model_rent_rub !== 350000) {
    errors.push("Base Object must retain the reconciled 500000 ₽ Ligovsky reference, the two-month approved rent-free term, and the separate historical 350000 ₽ Financial Model rent.");
  }
  const temporal = model.temporal;
  if (temporal?.financial_model_source !== "docs-platform/working/financial-model.yaml" || temporal?.launch_capex_lead_months !== 1) {
    errors.push("Temporal network planning must use the canonical Financial Model and a one-month launch-CAPEX lead.");
  }
  if (temporal?.rent_free_defaults?.street !== 2 || temporal?.rent_free_defaults?.creative_cluster !== 2 || temporal?.rent_free_defaults?.foodhall !== 0) {
    errors.push("Temporal network planning must retain 2-month street/cluster rent-free defaults and no automatic Foodhall rent-free period.");
  }
  if (model.staffing?.takeaway?.base?.roles?.CASHIER_BAR !== 1 || model.staffing?.takeaway?.base?.roles?.LINE_COOK !== 2) errors.push("Takeaway base must retain 1 cashier and 2 kitchen positions.");
  if (model.staffing?.seating?.minimum_total_area_m2 !== 60) errors.push("Seating planning minimum area must be 60m².");
  const rentalPresets = model.rental_presets;
  if (rentalPresets?.default_id !== "historic-center-core") errors.push("Network rent presets must default to historic-center-core.");
  if (rentalPresets?.standard_network_point?.baseline_area_m2 !== 40) errors.push("Standard network-point baseline area must be 40m².");
  if (rentalPresets?.standard_network_point?.minimum_ui_area_m2 !== 10) errors.push("Takeaway planning minimum area must be 10m².");
  const corePreset = rentalPresets?.presets?.["historic-center-core"];
  if (corePreset?.rent_per_m2_month_rub !== 3500 || corePreset?.monthly_rent_rub !== 140000) errors.push("Historic-center-core rent preset must retain 3500 ₽/m² and 140000 ₽/month.");
  if (rentalPresets?.rent_entry_defaults?.prepayment_months !== 12 || rentalPresets?.rent_entry_defaults?.security_deposit_months !== 2) errors.push("Standard street rent entry must default to 12 months prepaid rent and a 2-month security deposit.");
  const rollout = model.network_rollout;
  const expectedDistricts = ["nevsky-premium", "central-high-traffic", "historic-center-core", "historic-center-value"];
  if (JSON.stringify(rollout?.district_preset_ids) !== JSON.stringify(expectedDistricts)) errors.push("Network rollout must use the four approved district rent presets and exclude the flagship reference.");
  if (rollout?.default_additional_point_count !== 4 || rollout?.size_presets?.["4"]?.points_per_district !== 1 || rollout?.size_presets?.["8"]?.points_per_district !== 2 || rollout?.size_presets?.["12"]?.points_per_district !== 3) errors.push("Network rollout size presets must distribute 4/8/12 additional points evenly across the four districts.");
  const rolloutSchedule = rollout?.schedule;
  if (rolloutSchedule?.base_object_opening_month !== 0 || rolloutSchedule?.first_additional_opening_month !== 4 || rolloutSchedule?.additional_opening_interval_months !== 3 || rolloutSchedule?.repeated_group_wave_interval_months !== 12) {
    errors.push("Network rollout schedule must retain the approved Month 0 / 4 / 7 / 10 / 13 cadence and repeat interval.");
  }
  if (rollout?.default_point?.bar_enabled !== true) errors.push("Default additional points must keep the optional bar enabled.");
  const expectedGroups: Record<string, { format: string; location: string; area: number; checks: number; openingMonth: number }> = {
    "nevsky-premium": { format: "takeaway", location: "creative_cluster", area: 40, checks: 175, openingMonth: 4 },
    "central-high-traffic": { format: "takeaway", location: "foodhall", area: 25, checks: 215, openingMonth: 7 },
    "historic-center-core": { format: "with_seating", location: "street", area: 60, checks: 175, openingMonth: 10 },
    "historic-center-value": { format: "takeaway", location: "street", area: 40, checks: 150, openingMonth: 13 },
  };
  for (const [id, expected] of Object.entries(expectedGroups)) {
    const group = rollout?.groups?.[id];
    if (!group || group.format !== expected.format || group.location_type !== expected.location || group.baseline_area_m2 !== expected.area || group.checks_per_day !== expected.checks || group.first_opening_month !== expected.openingMonth || group.bar_enabled !== true) {
      errors.push(`Network rollout group ${id} does not match its approved first-stage profile.`);
    }
  }
  const historicCenterCore = rollout?.groups?.["historic-center-core"];
  if (historicCenterCore?.guest_area_m2 !== 30 || historicCenterCore?.approved_seat_count !== 19 || historicCenterCore?.furniture_provenance !== "owner_approved_phase_b4_2026-08-27") {
    errors.push("Historic-center-core must retain the B4 30m² guest area and approved 19-seat furniture baseline.");
  }
  if (rollout?.groups?.["nevsky-premium"]?.shared_seating !== true || rollout?.groups?.["central-high-traffic"]?.shared_seating !== true) errors.push("Creative Cluster and Foodhall rollout groups must use shared seating.");
  const foodhallDefaults = model.locations?.types?.foodhall?.defaults;
  if (foodhallDefaults?.revenue_share_percent !== 17 || foodhallDefaults?.minimum_guarantee_monthly_rub !== 250000 || foodhallDefaults?.service_charge_monthly_rub !== 50000 || foodhallDefaults?.storage_rent_monthly_rub !== 20000 || foodhallDefaults?.utilities_included !== true) {
    errors.push("Foodhall planning contract must retain the approved 17% / 250000 / 50000 / 20000 default terms.");
  }
  if (foodhallDefaults?.rent_entry?.prepayment_months !== null || foodhallDefaults?.rent_entry?.security_deposit_months !== null) errors.push("Foodhall planning contract must not inherit street rent entry terms.");
  const clusterDefaults = model.locations?.types?.creative_cluster?.defaults;
  if (clusterDefaults?.rent_per_m2_month_rub !== 4000 || clusterDefaults?.monthly_rent_rub !== 160000 || clusterDefaults?.utilities_monthly_rub !== 30000 || clusterDefaults?.rent_entry?.prepayment_months !== 12 || clusterDefaults?.rent_entry?.security_deposit_months !== 1) {
    errors.push("Creative Cluster planning contract must retain the approved rent, utility and entry defaults.");
  }
  if (clusterDefaults?.shared_seating !== true || clusterDefaults?.venue_security_included !== true || clusterDefaults?.common_cleaning_included !== true) errors.push("Creative Cluster planning defaults must retain venue-provided common services.");
  if (foodhallDefaults?.venue_music_included !== true || clusterDefaults?.venue_music_included !== true) errors.push("Venue-based points must retain the B3 venue-provided music treatment.");
  if (foodhallDefaults?.fitout_allowance_rub !== null || clusterDefaults?.fitout_allowance_rub !== null) errors.push("Venue preparation must not double-count the former generic fitout allowance.");
  if (model.staffing?.takeaway?.base?.up_to_portions_per_day !== 249 || model.staffing?.takeaway?.growth?.from_portions_per_day !== 250) errors.push("Takeaway staffing must retain the compact-point rounding band before growth staffing.");
  const preparation = model.preparation?.point_area_proxy;
  const expectedPreparationCategories = ["PREP-BUILDING", "PREP-ELECTRICAL", "PREP-WATER-DRAINAGE", "PREP-VENTILATION", "PREP-LIGHTING", "PREP-GUEST-AREA", "PREP-BUILT-IN", "PREP-DESIGN"];
  if (preparation?.reference_area_m2 !== 200 || JSON.stringify(preparation?.category_ids) !== JSON.stringify(expectedPreparationCategories)) errors.push("Point preparation proxy must reference the eight Integrated Pilot categories at 200m².");
  if (JSON.stringify(preparation?.disabled_category_ids_by_format?.takeaway) !== JSON.stringify(["PREP-GUEST-AREA"])) errors.push("Takeaway preparation must exclude the guest-area category.");
  const venuePreparation = ["PREP-BUILDING", "PREP-LIGHTING", "PREP-BUILT-IN", "PREP-DESIGN"];
  const venueOptionalPreparation = ["PREP-ELECTRICAL", "PREP-WATER-DRAINAGE", "PREP-VENTILATION"];
  if (JSON.stringify(preparation?.venue_shared_default_category_ids) !== JSON.stringify(venuePreparation) || JSON.stringify(preparation?.venue_shared_optional_category_ids) !== JSON.stringify(venueOptionalPreparation)) errors.push("Venue-based points must use the approved four-category preparation default and three optional engineering categories.");
  if (model.logistics?.own_vehicle_suggested_from_point_count !== 3 || model.logistics?.own_vehicle_point_count_scope !== "additional_network_points") {
    errors.push("Own logistics suggestion must start at three additional network points.");
  }
  const vehicleTreatment = model.logistics?.vehicle_financial_treatment;
  if (vehicleTreatment?.maintenance !== "included_in_owned_monthly_opex" || vehicleTreatment?.generic_equipment_maintenance_capex !== "excluded" || vehicleTreatment?.depreciation !== "requires_useful_life_decision") {
    errors.push("Vehicle maintenance must remain inside owned logistics OPEX, outside generic maintenance CAPEX, with useful life pending a separate decision.");
  }
  const completion = model.opex?.network_completion;
  if (completion?.administrative_reserve?.scope !== "shared_network" || completion?.administrative_reserve?.driver !== "consolidated_net_revenue_percentage") {
    errors.push("Administrative reserve must be a single shared percentage of consolidated revenue.");
  }
  if (completion?.household?.scope !== "point" || completion?.household?.driver !== "canonical_household_formula_per_point") {
    errors.push("Household OPEX must use the canonical per-point formula.");
  }
  if (completion?.equipment_service?.driver !== "incremental_equipment_asset_value_relative_to_current_base") {
    errors.push("Equipment service must scale from the actual incremental equipment asset basis.");
  }
  if (completion?.accounting?.treatment !== "one_current_base_function" || completion?.other_opex?.expansion_treatment !== "no_second_copy") {
    errors.push("Accounting and Other OPEX must remain single Base/shared functions rather than multiply across points.");
  }
  if (completion?.software?.treatment !== "requires_confirmation" || completion?.banking?.treatment !== "tbd_non_acquiring_service") {
    errors.push("Unconfirmed YUMA and banking terms must remain explicit assumption gaps.");
  }
  const barPointItems = model.equipment?.bar_enabled_point_items;
  if (!Array.isArray(barPointItems) || barPointItems.length !== 1 || barPointItems[0]?.item_id !== "CAPEX-02-013" || barPointItems[0]?.quantity_per_bar_enabled_point !== 1) {
    errors.push("A bar-enabled network point must include one CAPEX-02-013 compact ice maker through the planning equipment rule.");
  }
  const washPackages = model.equipment?.point_wash_packages;
  const expectedWashItems: Record<string, string[]> = {
    takeaway: ["CAPEX-01-019", "CAPEX-01-020", "CAPEX-01-021", "CAPEX-01-006"],
    with_seating: ["CAPEX-01-019", "CAPEX-01-020", "CAPEX-01-021", "CAPEX-01-006", "CAPEX-01-007"],
  };
  for (const [format, expected] of Object.entries(expectedWashItems)) {
    const selected = washPackages?.[format]?.components?.map((item: any) => item.item_id);
    if (!Array.isArray(selected) || JSON.stringify(selected) !== JSON.stringify(expected) || washPackages?.[format]?.no_dome_dishwasher !== true) {
      errors.push(`Point wash package ${format} must use the approved priced component list and exclude a dome dishwasher.`);
    }
  }
  const capacityEvidence = model.staffing?.production?.capacity_evidence;
  if (capacityEvidence?.evidence_status !== "documented_machine_envelopes_without_process_capacity" || !Array.isArray(capacityEvidence?.operations) || capacityEvidence.operations.length < 5) {
    errors.push("Production capacity evidence must preserve B4 machine-level documentation without inventing output throughput.");
  }
  if (!Array.isArray(capacityEvidence?.required_parameters) || capacityEvidence.required_parameters.length !== 3) {
    errors.push("Production capacity evidence must preserve the three precise process parameters required before capacity can be calculated.");
  }
  return errors;
}

function payrollPolicy(financial: any) {
  const contributions = financial.staffing.employer_contributions;
  return {
    defaultScenario: contributions.default_scenario,
    reduced: {
      mrotRub: Number(contributions.reduced.mrot_rub),
      thresholdMultiple: Number(contributions.reduced.threshold_multiple),
      rateBelowThreshold: Number(contributions.reduced.rate_below_threshold),
      rateAboveThreshold: Number(contributions.reduced.rate_above_threshold),
    },
    standard: { rate: Number(contributions.standard.rate) },
    personnelReserveRate: Number(financial.staffing.personnel_reserve_rate),
  };
}

function requiredOpexEntry(opex: Record<string, any>, id: string) {
  const entry = opex[id];
  if (!entry) throw new Error(`Canonical Financial Model is missing OPEX entry ${id}.`);
  return entry;
}

export function buildNetworkPlanningSnapshot(root = projectRoot) {
  const model = readNetworkPlanningModel(root);
  const errors = validateNetworkPlanningModel(model);
  if (errors.length) throw new Error(errors.join("\n"));
  const financial = readFinancialModel(root);
  const revenue = readRevenueModel(root);
  const requiredRoleIds = new Set(["CASHIER_BAR", "LINE_COOK", "PREP_COOK", "ADMINISTRATOR", "SOUS_CHEF", "MANAGER", "TECHNICAL"]);
  const roles = Object.fromEntries((financial.staffing.roles as any[])
    .filter(role => requiredRoleIds.has(role.id))
    .map(role => [role.id, { id: role.id, name: role.role, grossSalaryRub: Number(role.gross_salary_rub) }]));
  if (Object.keys(roles).length !== requiredRoleIds.size) throw new Error("Canonical Financial Model is missing a planning role salary reference.");
  const opex = Object.fromEntries((financial.opex.entries as any[]).map(entry => [entry.id, entry]));
  const historicalRealisticRosterHeadcount = (financial.staffing.roles as any[])
    .reduce((total, role) => total + Number(role.realistic_headcount), 0);
  if (historicalRealisticRosterHeadcount <= 0) throw new Error("Canonical Financial Model has no realistic roster calibration.");
  const contentState = buildNetworkPlanningContentState(root);
  return {
    meta: {
      schemaVersion: NETWORK_PLANNING_SNAPSHOT_SCHEMA_VERSION,
      dataVersion: model.document.version,
      contentStateSha256: contentState.content_state_sha256,
      sourceFiles: contentState.source_files,
      provenance: model.document.provenance,
      boundary: model.document.boundary,
    },
    planning: model,
    canonicalReferences: {
      roles,
      payrollPolicy: payrollPolicy(financial),
      revenue: {
        workingDaysPerMonth: Number(revenue.sales_calculation.days_per_month),
        foodPortionsPerCheck: Number(revenue.product_model.food_portions_per_check),
      },
      opex: {
        rawMaterialsRate: Number(financial.food_cost.protected_formula.raw_materials_rate),
        wasteRate: Number(financial.food_cost.waste.default_rate),
        packagingBaselineChecksPerDay: Number(financial.packaging.baseline_checks_per_day),
        packagingBaselineMonthlyRub: Number(financial.packaging.baseline_monthly_rub),
        acquiringRateOfGrossRevenue: Number(opex.ACQUIRING.rate_of_gross_revenue),
        marketingFixedMonthlyRub: Number(opex.MARKETING.fixed_amount_rub),
        marketingVariableRateOfNetRevenue: Number(opex.MARKETING.rate_of_net_revenue),
        administrativeReserveRateOfNetRevenue: Number(requiredOpexEntry(opex, "ADMINISTRATIVE_RESERVE").rate_of_net_revenue),
        householdFixedMonthlyRub: Number(requiredOpexEntry(opex, "HOUSEHOLD").fixed_amount_rub),
        householdVariableMonthlyRub: Number(requiredOpexEntry(opex, "HOUSEHOLD").variable_amount_rub),
        householdBaselineChecksPerDay: Number(requiredOpexEntry(opex, "HOUSEHOLD").baseline_checks_per_day),
        equipmentServiceMonthlyRub: Number(requiredOpexEntry(opex, "EQUIPMENT_SERVICE").amount_rub),
        accountingMonthlyRub: Number(requiredOpexEntry(opex, "ACCOUNTING").amount_rub),
        ventilationGreaseMonthlyRub: Number(requiredOpexEntry(opex, "VENT_GREASE").amount_rub),
        uniformRenewalMonthlyRub: Number(requiredOpexEntry(opex, "UNIFORM_RENEWAL").amount_rub),
        musicRightsMonthlyRub: Number(requiredOpexEntry(opex, "MUSIC_RIGHTS").amount_rub),
        pestControlMonthlyRub: Number(requiredOpexEntry(opex, "PEST").amount_rub),
        softwareMonthlyRub: Number(requiredOpexEntry(opex, "YUMA").amount_rub),
        medicalMonthlyRub: Number(requiredOpexEntry(opex, "MEDICAL").amount_rub),
        securityMonitoringMonthlyRub: Number(requiredOpexEntry(opex, "SECURITY_MONITORING").amount_rub),
        bankingMonthlyRub: Number(requiredOpexEntry(opex, "BANKING").amount_rub),
        otherOpexMonthlyRub: Number(requiredOpexEntry(opex, "OTHER").amount_rub),
        historicalRealisticRosterHeadcount,
      },
      launch: {
        launchMarketingRub: Number(financial.launch_investment.launch_marketing_rub),
      },
      temporal: {
        horizonMonths: Number(financial.model.horizon_months),
        openingCalendarMonth: Number(financial.model.opening_month),
        rampUpProfile: (financial.model.ramp_up_profile as any[]).map(item => ({ month: Number(item.month), factor: Number(item.ramp_factor) })),
        seasonalityProfile: (financial.model.seasonality_profile as any[]).map(item => ({ month: Number(item.month), factor: Number(item.seasonality_coefficient) })),
      },
    },
  };
}

function serializedSnapshot(root = projectRoot) {
  return `${JSON.stringify(buildNetworkPlanningSnapshot(root), null, 2)}\n`;
}

export function writeNetworkPlanningSnapshot() {
  const serialized = serializedSnapshot();
  const destination = path.join(projectRoot, NETWORK_PLANNING_SNAPSHOT_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: NETWORK_PLANNING_SNAPSHOT_PATH, sha256: crypto.createHash("sha256").update(serialized).digest("hex") };
}

export function checkNetworkPlanningSnapshot() {
  const destination = path.join(projectRoot, NETWORK_PLANNING_SNAPSHOT_PATH);
  if (!fs.existsSync(destination)) throw new Error("Network planning snapshot is missing. Run npm run network:planning:sync.");
  const actual = fs.readFileSync(destination, "utf8");
  const expected = serializedSnapshot();
  if (actual !== expected) throw new Error("Network planning snapshot is stale or non-deterministic. Run npm run network:planning:sync.");
  return { validation: "OK", path: NETWORK_PLANNING_SNAPSHOT_PATH, sha256: crypto.createHash("sha256").update(actual).digest("hex") };
}
