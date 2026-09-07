export const franchiseScenarioProfileIds = [
  "READY_PRODUCTION_BASE",
  "CUSTOM_PRODUCTION_BASE",
  "OWNED_PRODUCTION_BASE",
] as const;

export type FranchiseScenarioProfileId = (typeof franchiseScenarioProfileIds)[number];
export type FranchiseParameterStatus = "assumption" | "missing_input" | "scenario_structure" | "derived_when_inputs_confirmed";

export type FranchiseParameter = {
  id: string;
  label: string;
  value: number | null;
  unit: "RUB" | "points" | "percent" | "share" | "not_applicable";
  status: FranchiseParameterStatus;
  note?: string;
};

/**
 * This is an input contract, not a financial engine. Values remain separate
 * from the governed Financial Core until their source data is confirmed.
 */
export const franchisePlatformParameters: readonly FranchiseParameter[] = [
  { id: "central_production_capacity", label: "Мощность центрального производства", value: 10, unit: "points", status: "assumption", note: "До 10 торговых точек; требует технологического подтверждения." },
  { id: "franchise_unit_count", label: "Количество франчайзинговых точек", value: null, unit: "points", status: "scenario_structure" },
  { id: "own_unit_count", label: "Количество собственных точек", value: 1, unit: "points", status: "scenario_structure" },
  { id: "franchise_entry_fee", label: "Паушальный взнос", value: 1_000_000, unit: "RUB", status: "assumption", note: "Рабочая иллюстрация, не цена франшизы." },
  { id: "royalty_rate", label: "Роялти", value: 5, unit: "percent", status: "assumption" },
  { id: "transfer_price_by_sku", label: "Трансфертная цена по SKU", value: null, unit: "RUB", status: "missing_input" },
  { id: "production_utilization", label: "Загрузка производства", value: null, unit: "share", status: "missing_input" },
  { id: "production_fixed_cost", label: "Постоянные затраты производства", value: null, unit: "RUB", status: "missing_input" },
  { id: "production_variable_cost", label: "Переменные затраты производства", value: null, unit: "RUB", status: "missing_input" },
  { id: "delivery_cost", label: "Стоимость доставки", value: null, unit: "RUB", status: "missing_input" },
  { id: "marketing_fee", label: "Маркетинговый сбор", value: null, unit: "not_applicable", status: "missing_input" },
  { id: "franchisee_opex", label: "Операционные расходы франчайзи", value: null, unit: "RUB", status: "missing_input" },
  { id: "franchisee_ebitda", label: "EBITDA франчайзи", value: null, unit: "RUB", status: "derived_when_inputs_confirmed" },
  { id: "franchisee_cash_flow", label: "Денежный поток франчайзи", value: null, unit: "RUB", status: "derived_when_inputs_confirmed" },
];

export const franchiseScenarioMatrix = [
  { ownUnitCount: 1, franchiseUnitCount: 0 },
  { ownUnitCount: 1, franchiseUnitCount: 3 },
  { ownUnitCount: 1, franchiseUnitCount: 5 },
  { ownUnitCount: 1, franchiseUnitCount: 9 },
] as const;

export const petrogradkaReadyProductionScenario = {
  id: "PETROGRADKA",
  profile: "READY_PRODUCTION_BASE" as const,
  status: "research" as const,
  capacityStatus: "assumption" as const,
  equipmentStatus: "available_subject_to_confirmation" as const,
  infrastructureStatus: "available_subject_to_confirmation" as const,
  capex: {
    centralProductionEquipmentDelta: [1_100_000, 1_300_000] as const,
    eeOffice: [550_000, 700_000] as const,
    mediaProgram: [1_200_000, 1_600_000] as const,
    infrastructureBase: [3_000_000, 3_600_000] as const,
  },
  excluded: ["аренда", "депозит", "ФОТ", "товарный запас", "торговый зал", "отдельные торговые точки"] as const,
} as const;

export function franchisePlatformCalculationStatus() {
  const missing = franchisePlatformParameters.filter((parameter) => parameter.status === "missing_input").map((parameter) => parameter.id);
  return {
    status: missing.length ? "missing_inputs" as const : "ready_for_canonical_financial_core" as const,
    missing,
    rule: "Никаких расчётных результатов до заполнения входов; будущие расчёты используют существующие контуры point, production, shared_network и logistics.",
  };
}
