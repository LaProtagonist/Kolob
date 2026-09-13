import {
  buildCapexRows,
  emptyCapexParameters,
  capexData,
} from "./capex-runtime";
import profile from "../../docs-platform/working/franchise-model-v0.2.json";
import type { EquipmentSelection, Scenario } from "./franchise-model-types";
export const equipmentGroups = {
  production: "Производство",
  retail: "Торговая точка",
  shared: "Общее оборудование",
  it: "Касса и управление заказами (IT / POS / KDS)",
  additional: "Дополнительное",
  bar: "Напитки (BAR)",
  grow: "Выращивание зелени (GROW)",
  unclassified: "Требует классификации",
};
export type EquipmentGroup = keyof typeof equipmentGroups;
const modules = [...profile.nodeModules, "MOD-BAR", "MOD-GROW"];
const allRows = buildCapexRows(
  new Set(modules),
  "base",
  emptyCapexParameters(),
);
export const equipmentCatalog = allRows
  .filter(
    (row) =>
      row.independentProcurement &&
      !row.item.id.startsWith("CAPEX-05-") &&
      !profile.nodeExcludedItems.includes(row.item.id),
  )
  .map((row) => {
    const groups = [
      ...new Set(
        row.moduleIds.map(
          (id) =>
            (profile.moduleGroups as Record<string, string>)[id] ||
            "unclassified",
        ),
      ),
    ];
    return {
      id: row.item.id,
      name: row.item.name,
      group: (groups.length === 1
        ? groups[0]
        : "unclassified") as EquipmentGroup,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      sourceId: row.price?.sourceId ?? row.item.sourceId,
      sourceUrl: row.price?.sourceUrl ?? row.item.sourceUrl,
      note: row.item.priceNotes ?? "",
      quoteRequired: row.quoteRequired,
    };
  });
export function defaultBom(kind: "node" | "franchise"): EquipmentSelection[] {
  const ids = profile.profiles[0].itemIds;
  return equipmentCatalog
    .filter((row) => kind === "node" || ids.includes(row.id))
    .map((row) => ({
      itemId: row.id,
      selected: row.quantity !== 0,
      quantity: row.quantity,
      override: null,
    }));
}
export function equipmentBom(s: Scenario, kind: "node" | "franchise") {
  const selection =
    s.integration?.[kind === "node" ? "nodeBom" : "franchiseBom"] ??
    defaultBom(kind);
  const rows = selection.map((sel) => {
    const item = equipmentCatalog.find((x) => x.id === sel.itemId);
    const applicable =
      sel.selected &&
      (kind === "franchise" ||
        ((item?.group !== "bar" || s.integration?.bar) &&
          (item?.group !== "grow" || s.integration?.grow)));
    const price = sel.override ?? item?.unitPrice ?? null;
    const classified = !!item && item.group !== "unclassified";
    const total =
      applicable && classified && price !== null && sel.quantity !== null
        ? price * sel.quantity
        : null;
    return { ...sel, item, applicable, price, total, classified };
  });
  const included = rows.filter((x) => x.applicable);
  const gaps = kind === "franchise" ? profile.profiles[0].gaps : [];
  const unpriced =
    included.filter((x) => x.total === null).length + gaps.length;
  const knownTotal = included.reduce((sum, row) => sum + (row.total ?? 0), 0);
  const breakdown = (Object.keys(equipmentGroups) as EquipmentGroup[]).map(
    (group) => ({
      group,
      label: equipmentGroups[group],
      amount: included
        .filter((x) => x.item?.group === group)
        .reduce((sum, row) => sum + (row.total ?? 0), 0),
      count: included.filter((x) => x.item?.group === group).length,
    }),
  );
  return {
    rows,
    gaps,
    knownTotal,
    unpriced,
    complete: unpriced === 0,
    breakdown,
    quoteCount: included.filter((x) => x.item?.quoteRequired).length,
  };
}
export const equipmentSourceState = capexData.meta.contentStateSha256;
