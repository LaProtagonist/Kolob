/**
 * Shared asset semantics for the governed Financial Model and the Network
 * projection. This module carries categories and useful lives only; prices and
 * quantities continue to come from the CAPEX / Investor Start sources.
 */

export const financialDepreciationUsefulLives = {
  POS_KDS_IT_SMALL: 3,
  MAIN_KITCHEN: 5,
  GROW: 5,
  FURNITURE: 5,
  COLD_FREEZER: 10,
  ENGINEERING: 10,
  FIT_OUT: 7,
  UNCLASSIFIED: 5,
} as const;

export type FinancialDepreciationCategory = keyof typeof financialDepreciationUsefulLives;

export type FinancialDepreciationAsset = {
  item_id: string;
  name: string;
  amount_rub: number;
  category: FinancialDepreciationCategory;
  useful_life_years: number;
  mapping_status: "mapped" | "mapping_requires_review";
};

export type EquipmentAssetInput = {
  id: string;
  name: string;
  amountRub: number;
  moduleIds: readonly string[];
};

export type PreparationAssetInput = {
  id: string;
  name: string;
  amountRub: number;
};

export const preparationEngineeringCategoryIds = new Set([
  "PREP-ELECTRICAL",
  "PREP-WATER-DRAINAGE",
  "PREP-VENTILATION",
  "PREP-LIGHTING",
]);

/**
 * Network assets carry a cohort prefix for provenance (`cohort:PREP-*`).
 * Classification remains based on the governed source category ID.
 */
function canonicalAssetId(id: string) {
  return id.split(":").at(-1) ?? id;
}

function asset(
  itemId: string,
  name: string,
  amountRub: number,
  category: FinancialDepreciationCategory,
  mappingStatus: FinancialDepreciationAsset["mapping_status"] = "mapped",
): FinancialDepreciationAsset {
  return {
    item_id: itemId,
    name,
    amount_rub: amountRub,
    category,
    useful_life_years: financialDepreciationUsefulLives[category],
    mapping_status: mappingStatus,
  };
}

/** Uses the same useful-life routing as the governed Financial Model. */
export function equipmentDepreciationAsset(input: EquipmentAssetInput): FinancialDepreciationAsset {
  // Network rows prefix the canonical item id with a cohort id for provenance.
  // The useful-life classification must still be based on the governed CAPEX id.
  const canonicalItemId = canonicalAssetId(input.id);
  if (["CAPEX-01-001", "CAPEX-01-002"].includes(canonicalItemId)) {
    return asset(input.id, input.name, input.amountRub, "COLD_FREEZER");
  }
  if (input.moduleIds.some((id) => id === "MOD-POS" || id === "MOD-KDS")) {
    return asset(input.id, input.name, input.amountRub, "POS_KDS_IT_SMALL");
  }
  if (input.moduleIds.includes("MOD-GROW")) {
    return asset(input.id, input.name, input.amountRub, "GROW");
  }
  if (input.moduleIds.some((id) => ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-WASH", "MOD-TAKEAWAY"].includes(id))) {
    return asset(input.id, input.name, input.amountRub, "MAIN_KITCHEN");
  }
  return asset(input.id, input.name, input.amountRub, "UNCLASSIFIED", "mapping_requires_review");
}

export function furnitureDepreciationAsset(itemId: string, name: string, amountRub: number): FinancialDepreciationAsset {
  return asset(itemId, name, amountRub, "FURNITURE");
}

export function preparationDepreciationAsset(input: PreparationAssetInput): FinancialDepreciationAsset {
  return asset(
    input.id,
    input.name,
    input.amountRub,
    preparationEngineeringCategoryIds.has(canonicalAssetId(input.id)) ? "ENGINEERING" : "FIT_OUT",
  );
}

export function smallEquipmentDepreciationAsset(itemId: string, name: string, amountRub: number): FinancialDepreciationAsset {
  return asset(itemId, name, amountRub, "POS_KDS_IT_SMALL");
}

export function fitOutDepreciationAsset(itemId: string, name: string, amountRub: number): FinancialDepreciationAsset {
  return asset(itemId, name, amountRub, "FIT_OUT");
}

export function monthlyDepreciation(assets: readonly FinancialDepreciationAsset[]) {
  return assets.reduce((total, item) => total + item.amount_rub / (item.useful_life_years * 12), 0);
}

/** Current Financial Model semantics: maintenance applies to equipment plus furniture, not property or vehicles. */
export function monthlyMaintenanceCapex(applicableAssetBasisRub: number, annualRate: number) {
  return applicableAssetBasisRub * annualRate / 12;
}
