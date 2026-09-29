export type FundingParty = "owner" | "operator";
export type EngineeringResponsibility = {
  id: string;
  label: string;
  payer: FundingParty;
  amountRub: number | null;
  includedInPreparation: boolean;
};

/** Allocation only: changing a payer never changes the cost or fills a missing quote. */
export function allocatePropertyFunding(preparationRub: number, works: EngineeringResponsibility[]) {
  let ownerRub = 0;
  let operatorRub = preparationRub;
  const unresolved: EngineeringResponsibility[] = [];
  for (const work of works) {
    if (work.amountRub === null) { unresolved.push(work); continue; }
    if (!Number.isFinite(work.amountRub) || work.amountRub < 0) throw new Error("Invalid engineering amount");
    if (work.includedInPreparation) operatorRub -= work.amountRub;
    if (work.payer === "owner") ownerRub += work.amountRub;
    else operatorRub += work.amountRub;
  }
  if (operatorRub < 0) throw new Error("Allocated works exceed preparation budget");
  return { ownerRub, operatorRub, totalKnownRub: ownerRub + operatorRub, unresolved };
}

export const openingBudgetGroups = ["preparation", "equipment", "launch", "inventory", "contingency"] as const;
export type OpeningBudgetGroup = typeof openingBudgetGroups[number];
export type OpeningBudgetSelection = Record<OpeningBudgetGroup, boolean>;
export type OpeningBudgetRow = {
  id: OpeningBudgetGroup;
  knownRub: number;
  partial: boolean;
  included: boolean;
};
export type OpeningBudgetVariant = { rows: OpeningBudgetRow[]; knownRub: number; partial: boolean };

export function openingBudgetKey(selection: OpeningBudgetSelection) {
  return openingBudgetGroups.map(id => selection[id] ? "1" : "0").join("");
}

/** Select a build-time canonical projection; no financial formula in the public UI. */
export function selectOpeningBudget(variants: Record<string, OpeningBudgetVariant>, selection: OpeningBudgetSelection) {
  const result = variants[openingBudgetKey(selection)];
  if (!result) throw new Error("Missing canonical opening budget selection");
  return result;
}

/** Retain known reserve obligations when a contractual line is still missing. */
export function knownOperatingReserve(reserve: { months: number; includedLines: Array<{ id: string; monthlyAmountRub: number | null }> }) {
  return {
    knownRub: Math.round(reserve.includedLines.reduce((sum, line) => sum + (line.monthlyAmountRub ?? 0), 0) * reserve.months * 100) / 100,
    missingLineIds: reserve.includedLines.filter(line => line.monthlyAmountRub === null).map(line => line.id),
  };
}
