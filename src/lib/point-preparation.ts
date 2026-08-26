import { launchModel, type PreparationMode } from "./launch-budget";
import { networkPlanningModel } from "./network-planning";
import type { TradingPointFormat } from "./investor-configuration";
import type { LocationType } from "./network-planning";

export type PointPreparationInput = {
  areaM2: number | null;
  format: TradingPointFormat;
  locationType?: LocationType;
  sharedSeating?: boolean | null;
  mode: PreparationMode;
  enabledCategoryIds: string[];
  manualRub: number | null;
};

export type PointPreparationRow = {
  id: string;
  name: string;
  referenceAmountRub: number;
  amountRub: number | null;
  enabled: boolean;
  applicable: boolean;
};

export type PointPreparationProjection = {
  mode: PreparationMode;
  areaM2: number | null;
  referenceAreaM2: number;
  rows: PointPreparationRow[];
  calculatedRub: number | null;
  effectiveRub: number | null;
  isManual: boolean;
  note: string;
};

const proxy = networkPlanningModel.preparation.point_area_proxy as {
  reference_area_m2: number;
  category_ids: string[];
  disabled_category_ids_by_format: Record<TradingPointFormat, string[]>;
  venue_shared_default_category_ids?: string[];
  venue_shared_optional_category_ids?: string[];
};

export const pointPreparationCategoryIds = proxy.category_ids as string[];

export function defaultPointPreparationCategoryIds(
  format: TradingPointFormat,
  locationType: LocationType = "street",
  sharedSeating: boolean | null = null,
) {
  const disabled = new Set(proxy.disabled_category_ids_by_format[format] ?? []);
  const isVenueWithSharedSeating = sharedSeating === true && (locationType === "foodhall" || locationType === "creative_cluster");
  if (isVenueWithSharedSeating) disabled.add("PREP-GUEST-AREA");
  if (isVenueWithSharedSeating && Array.isArray(proxy.venue_shared_default_category_ids)) {
    return proxy.venue_shared_default_category_ids.filter((id) => !disabled.has(id));
  }
  return pointPreparationCategoryIds.filter((id) => !disabled.has(id));
}

export function pointPreparationProjection(input: PointPreparationInput): PointPreparationProjection {
  const disabled = new Set(proxy.disabled_category_ids_by_format[input.format] ?? []);
  const isVenueWithSharedSeating = input.sharedSeating === true && (input.locationType === "foodhall" || input.locationType === "creative_cluster");
  if (isVenueWithSharedSeating) disabled.add("PREP-GUEST-AREA");
  const enabled = new Set(input.enabledCategoryIds);
  const referenceAreaM2 = Number(proxy.reference_area_m2);
  const rows = pointPreparationCategoryIds.map((id) => {
    const category = launchModel.preparation.categories.find((item) => item.id === id);
    if (!category) throw new Error(`Point preparation category ${id} is not available in the canonical launch model.`);
    const applicable = !disabled.has(id);
    const isEnabled = applicable && enabled.has(id);
    return {
      id,
      name: category.name,
      referenceAmountRub: category.amount_rub,
      amountRub: input.areaM2 === null || !applicable ? null : category.amount_rub * input.areaM2 / referenceAreaM2,
      enabled: isEnabled,
      applicable,
    };
  });
  const calculatedRub = input.areaM2 === null
    ? null
    : rows.reduce((total, row) => total + (row.enabled ? (row.amountRub ?? 0) : 0), 0);
  const isManual = input.mode === "manual";
  return {
    mode: input.mode,
    areaM2: input.areaM2,
    referenceAreaM2,
    rows,
    calculatedRub,
    effectiveRub: isManual ? input.manualRub : calculatedRub,
    isManual,
    note: isVenueWithSharedSeating
      ? "Для готовой площадки учитывается адаптация и оформление точки. Инженерные работы можно включить, если они требуются конкретному помещению."
      : "Предварительная оценка по площади. Итог можно заменить собственной сметой.",
  };
}
