/** Shared, price-free format rules. Sources live in capex-point-formats.yaml. */
export type CapexComposition = {
  id: "retail_complete";
  version: number;
  label: string;
  groups: Array<{ id: string; name: string; kind: string; item_ids: string[] }>;
  quantity_overrides: Record<string, number>;
  functions: Array<{ id: string; name: string; item_ids: string[]; gaps: string[] }>;
  external_groups: string[];
  notes: string;
};

export type CompositionOptions = { barEnabled: boolean; washMode: "manual" | "machine" };

export function compositionGroups(profile: CapexComposition, options: CompositionOptions) {
  return profile.groups.filter(group => options.barEnabled || group.id !== "point-bar");
}

export function compositionAllowsItem(profile: CapexComposition, options: CompositionOptions, itemId: string) {
  return compositionGroups(profile, options).some(group => group.item_ids.includes(itemId));
}

export function capexConditionSatisfied(condition: string | null, options: {
  alcoholEnabled: boolean; compositionProfile?: string; washMode?: "manual" | "machine";
}) {
  if (!condition) return true;
  if (condition.trim() === "alcohol_enabled == true") return options.alcoholEnabled;
  // Historical descriptive annotations: module selection already controls them.
  if (["Включается только при отдельном выборе опционального направления.", "Зависит от выбранного формата, параметров локации или отдельного решения."].includes(condition)) return true;
  if (condition === "retail_complete") return options.compositionProfile === "retail_complete";
  if (condition === "retail_complete && machine_wash") return options.compositionProfile === "retail_complete" && options.washMode === "machine";
  // New conditions must be implemented explicitly, never silently included.
  throw new Error(`Unsupported CAPEX condition: ${condition}`);
}
