// Build-time adapter only. All financial calculations stay in the existing engines.
import scenario from "../docs-platform/scenarios/sennaya-flagship.json";
import { defaultInvestorConfiguration, createNetworkPointCohort } from "../src/lib/investor-configuration";
import { networkScalingProjection, pointContingencyItem } from "../src/lib/network-scaling";
import { calculateRevenueModel } from "../src/lib/revenue-model";
import { calculateLaunchBudget, defaultLaunchBudgetState, launchModel, calculateSeatCount } from "../src/lib/launch-budget";
import { canonicalNetworkOpexConstants, logisticsPlanning, networkPlanningLaunchConstants, sharedManagerPayrollProjection } from "../src/lib/network-planning";
import { capexData, buildFormatCapexRows, formatCompositionSummary, emptyCapexParameters } from "../src/lib/capex-runtime";
import { expansionReserveProjection } from "../src/lib/network-financial-core";
import { knownOperatingReserve, openingBudgetGroups, openingBudgetKey, type OpeningBudgetSelection, type OpeningBudgetVariant } from "../src/lib/property-funding";

export function projectSennaya() {
  const baselineRevenue = calculateRevenueModel({ trafficMode: "scenario", trafficScenario: "realistic", customChecksPerDay: null, customAverageCheckRub: null });
  const averageCheckRub = baselineRevenue.averageCheckRub;
  if (averageCheckRub === null) throw new Error("Canonical average check is missing");
  const configuration = defaultInvestorConfiguration();
  const projections = scenario.checksScenarios.map(checks => {
    const cohort = createNetworkPointCohort(configuration.launchBudget, {
      id: scenario.id, format: "with_seating", locationRentPresetId: "custom",
      capexCompositionProfile: scenario.capexCompositionProfile as "retail_complete", washMode: scenario.washMode as "manual" | "machine",
      totalAreaM2: scenario.areaM2, guestAreaM2: scenario.illustrativeGuestAreaM2,
      approvedSeatCount: null, monthlyRentRub: scenario.occupancyMonthlyRub,
      // The real-estate investor's purchase never makes operating occupancy free.
      realEstateMode: "rent", purchasePriceRub: null,
      prepaymentMonths: null, securityDepositMonths: null, rentFreeMonths: 0,
      barEnabled: scenario.barEnabled, extractionAvailable: null,
      sales: { mode: "custom", checksPerDay: checks, averageCheckRub },
    });
    const input = structuredClone(configuration);
    input.networkScaling.cohorts = [input.networkScaling.cohorts[0], cohort];
    const scaling = networkScalingProjection(input, { buildRows: buildFormatCapexRows, summarize: formatCompositionSummary });
    return { ...scaling.cohorts[1], reserve: expansionReserveProjection(input, scaling).cohortReserves[0] };
  });
  const base = projections.find(p => p.operational.sales.checksPerDay === scenario.targetChecksPerDay)!;
  const item = (suffix: string) => base.pointItems.find(i => i.id === suffix || i.id.endsWith(`:${suffix}`))!;
  const rows = buildFormatCapexRows(scenario.formatId, "base", emptyCapexParameters({ seatCount: calculateSeatCount(scenario.illustrativeGuestAreaM2, launchModel.seating.profiles.find(p => p.id === configuration.launchBudget.seatingProfileId)!.square_metres_per_seat), cashierPostCount: capexData.pilotConfiguration.cashier_post_count, hotKitchenPostCount: capexData.pilotConfiguration.hot_kitchen_post_count, fillingCount: capexData.pilotConfiguration.filling_count }), { barEnabled: scenario.barEnabled, washMode: scenario.washMode as "manual" });
  const composition = formatCompositionSummary(scenario.formatId, "base", rows, { barEnabled: scenario.barEnabled, washMode: scenario.washMode as "manual" });
  const equipmentGroups = composition.groups.filter(group => group.kind === "equipment").map(group => ({ label: group.name, amountRub: group.knownRub, missingCount: group.missingCount }));
  equipmentGroups.push({ label: "Мебель гостевой зоны", amountRub: item("furniture").amountRub!, missingCount: 0 });
  const seating = launchModel.seating.profiles.find(p => p.id === configuration.launchBudget.seatingProfileId)!;
  const launch = networkPlanningLaunchConstants();
  const operatingReserve = knownOperatingReserve(base.reserve);
  const equipmentWithSecurityRub = equipmentGroups.reduce((sum, group) => sum + group.amountRub, 0) + item("security").amountRub!;
  const openingServicesRub = composition.groups.filter(group => group.kind !== "equipment").reduce((sum, group) => sum + group.knownRub, 0);
  // Enumerate the finite public work scopes through the existing contingency engine.
  // Operating reserve and rent entry never enter this projection.
  const openingBudgetVariants: Record<string, OpeningBudgetVariant> = {};
  for (let mask = 0; mask < 2 ** openingBudgetGroups.length; mask++) {
    const selection = Object.fromEntries(openingBudgetGroups.map((id, index) => [id, Boolean(mask & (1 << index))])) as OpeningBudgetSelection;
    const equipmentIds = [...composition.groups.filter(group => group.kind === "equipment").map(group => group.id), "furniture", "security"];
    const selectedItems = base.pointItems.filter(line => {
      const is = (id: string) => line.id === id || line.id.endsWith(`:${id}`);
      return (selection.preparation && is("point-preparation"))
        || (selection.equipment && equipmentIds.some(is))
        || (selection.equipment && selection.contingency && is("point-bundle-reserve"));
    });
    const calculatedContingency = pointContingencyItem(configuration, selectedItems);
    if (calculatedContingency.amountRub === null) throw new Error("Missing canonical contingency basis");
    const amounts = {
      preparation: item("point-preparation").amountRub!,
      equipment: equipmentWithSecurityRub,
      launch: launch.launchMarketingRub + item("uniform").amountRub! + openingServicesRub,
      inventory: item("initial-inventory").amountRub!,
      contingency: calculatedContingency.amountRub + (selection.equipment ? composition.reserveRub : 0),
    };
    const selectedRows = openingBudgetGroups.map(id => ({ id, knownRub: selection[id] ? amounts[id] : 0, included: selection[id], partial: id !== "inventory" }));
    openingBudgetVariants[openingBudgetKey(selection)] = {
      rows: selectedRows,
      knownRub: selectedRows.reduce((sum, row) => sum + row.knownRub, 0),
      partial: selectedRows.some(row => row.included && row.partial),
    };
  }
  return {
    public: {
      areaM2: scenario.areaM2, guestAreaRangeM2: scenario.guestAreaRangeM2, targetSeatRange: scenario.targetSeatRange,
      illustrativeGuestAreaM2: scenario.illustrativeGuestAreaM2,
      illustrativeSeats: calculateSeatCount(scenario.illustrativeGuestAreaM2, seating.square_metres_per_seat),
      targetChecksPerDay: scenario.targetChecksPerDay, averageCheckRub,
      daysPerMonth: base.operational.sales.workingDaysPerMonth,
      revenueScenarios: projections.map(p => ({ checksPerDay: p.operational.sales.checksPerDay!, revenueMonthlyRub: p.operational.sales.revenuePerPointRub! })),
      occupancyMonthlyRub: scenario.occupancyMonthlyRub, advertisedPowerKw: scenario.advertisedPowerKw,
      hotPosts: capexData.pilotConfiguration.hot_kitchen_post_count,
      cashierPosts: capexData.pilotConfiguration.cashier_post_count,
      openingBudgetVariants,
      // Only the short property proposal is exported to the public bundle.
      // Full BOM, staffing, operating reserve and responsibility remain internal.
    },
    audit: { scenario, composition, rows, projections, equipmentGroups,
      equipmentSubtotalRub: equipmentGroups.reduce((sum, group) => sum + group.amountRub, 0),
      legacyIntegratedEquipmentRub: calculateLaunchBudget(defaultLaunchBudgetState()).equipment.total,
      knownLaunchSubtotalRub: base.confirmedPointInvestmentRub + launch.launchMarketingRub,
      openingServices: composition.groups.filter(group => group.kind !== "equipment"),
      constants: canonicalNetworkOpexConstants(), logistics: logisticsPlanning(1), seating,
      staffing: { point: base.operational.staffing, sharedManager: sharedManagerPayrollProjection(1), operatingReserve,
        gaps: ["Подбор персонала: нет стоимости", "Обучение продукту и стандартам: нет длительности и стоимости", "Зарплата до открытия: нет длительности оплачиваемой подготовки", "Достаточность одной кассовой/барной позиции и совмещения зала/мойки требует хронометража в пик", "Управляющий учтён в общем контуре; распределение на точку не утверждено"] },
      excludedFromPublishedProfit: ["Полное распределение расходов заготовочного цеха", "Общесетевые постоянные расходы и логистика", "Подтверждение договорных расходов помещения"],
      sourceFiles: ["capex-equipment-register.yaml", "capex-equipment-specification.md", "pilot-capex-assumptions.yaml", "investor-start-model.yaml", "financial-model.yaml", "revenue-model.yaml", "network-planning-assumptions.yaml", "src/lib/physical-allocation.ts"],
    },
  };
}
