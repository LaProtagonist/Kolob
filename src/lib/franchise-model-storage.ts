import { newStore, parameters, STORAGE_KEY } from "./franchise-model-scenario";
import type { Scenario, ScenarioStore } from "./franchise-model-types";
import {
  defaultIntegration,
  integrationParameters,
  referenceValues,
} from "./franchise-model-data";
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const numeric = (x: unknown) =>
  x === null || (typeof x === "number" && Number.isFinite(x));
function scenarioShape(x: unknown): x is Scenario {
  if (
    !record(x) ||
    x.schemaVersion !== 1 ||
    typeof x.id !== "string" ||
    !x.id ||
    typeof x.name !== "string" ||
    typeof x.custom !== "boolean" ||
    !record(x.inputs)
  )
    return false;
  const values = x.inputs;
  if (!parameters.every((p) => numeric(values[p.id]))) return false;
  if (x.integration !== undefined) {
    const i = x.integration;
    if (
      !record(i) ||
      i.version !== 2 ||
      !["bom", "manual"].includes(String(i.equipmentMode)) ||
      !["structured", "manual"].includes(String(i.ownOpexMode)) ||
      !["reference", "manual"].includes(String(i.taxMode)) ||
      !["reference", "manual"].includes(String(i.maintenanceMode)) ||
      typeof i.bar !== "boolean" ||
      typeof i.grow !== "boolean" ||
      typeof i.seasonality !== "boolean" ||
      typeof i.calendarStartMonth !== "number" ||
      !Number.isInteger(i.calendarStartMonth) ||
      i.calendarStartMonth < 1 ||
      i.calendarStartMonth > 12
    )
      return false;
    for (const name of ["nodeBom", "franchiseBom"])
      if (
        !Array.isArray(i[name]) ||
        i[name].length > 300 ||
        !i[name].every(
          (r: unknown) =>
            record(r) &&
            typeof r.itemId === "string" &&
            typeof r.selected === "boolean" &&
            numeric(r.quantity) &&
            numeric(r.override),
        )
      )
        return false;
  }
  if (
    !Array.isArray(x.edited) ||
    !x.edited.every(
      (id) => typeof id === "string" && parameters.some((p) => p.id === id),
    )
  )
    return false;
  if (
    !Array.isArray(x.rollout) ||
    x.rollout.length > 120 ||
    !x.rollout.every(
      (p) =>
        record(p) &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.active === "boolean" &&
        (p.ramp === undefined ||
          p.ramp === "reference" ||
          p.ramp === "mature") &&
        ["OWN", "FRANCHISE"].includes(String(p.type)) &&
        typeof p.month === "number" &&
        Number.isFinite(p.month) &&
        [
          "revenueDay",
          "averageCheck",
          "days",
          "labor",
          "rent",
          "opex",
          "capex",
        ].every((k) => numeric(p[k])),
    )
  )
    return false;
  if (
    !Array.isArray(x.expansions) ||
    x.expansions.length > 120 ||
    !x.expansions.every(
      (e) =>
        record(e) &&
        typeof e.id === "string" &&
        typeof e.month === "number" &&
        Number.isFinite(e.month) &&
        typeof e.capacity === "number" &&
        Number.isFinite(e.capacity) &&
        ["capex", "opex", "fte"].every((k) => numeric(e[k])),
    )
  )
    return false;
  return (
    Array.isArray(x.capitalCalls) &&
    x.capitalCalls.length <= 120 &&
    x.capitalCalls.every(
      (c) =>
        record(c) &&
        typeof c.id === "string" &&
        typeof c.month === "number" &&
        Number.isFinite(c.month) &&
        numeric(c.amount),
    )
  );
}
export function parseStore(raw: string): ScenarioStore | null {
  try {
    const x: unknown = JSON.parse(raw);
    // Extend the v1 storage contract without deleting saved scenarios or changing their explicit inputs.
    if (record(x) && x.schemaVersion === 1 && Array.isArray(x.scenarios))
      for (const candidate of x.scenarios) {
        if (!record(candidate) || !record(candidate.inputs)) continue;
        for (const p of integrationParameters)
          if (!(p.id in candidate.inputs)) candidate.inputs[p.id] = p.value;
      }
    if (
      !record(x) ||
      x.schemaVersion !== 1 ||
      !Array.isArray(x.scenarios) ||
      x.scenarios.length < 1 ||
      x.scenarios.length > 30 ||
      !x.scenarios.every(scenarioShape)
    )
      return null;
    const ids = x.scenarios.map((s) => s.id);
    if (
      new Set(ids).size !== ids.length ||
      !x.scenarios.some((s) => s.id === "working-v01" && !s.custom) ||
      x.scenarios.some((s) => s.id !== "working-v01" && !s.custom) ||
      !ids.includes(String(x.activeId))
    )
      return null;
    if (
      !Array.isArray(x.compareIds) ||
      x.compareIds.length > 3 ||
      new Set(x.compareIds).size !== x.compareIds.length ||
      !x.compareIds.every((id) => ids.includes(id))
    )
      return null;
    return x as unknown as ScenarioStore;
  } catch {
    return null;
  }
}
function integrateSaved(s: Scenario): Scenario {
  if (s.integration) return s;
  const next = structuredClone(s),
    i = defaultIntegration();
  i.equipmentMode = "manual";
  i.ownOpexMode = s.inputs.own_local !== null ? "manual" : "structured";
  i.taxMode = s.edited.some((id) => ["tax_profit", "tax_sales"].includes(id))
    ? "manual"
    : "reference";
  if (i.taxMode === "reference")
    for (const id of ["tax_profit", "tax_sales"])
      next.inputs[id] = referenceValues[id];
  i.maintenanceMode =
    s.inputs.maintenance !== null || s.edited.includes("maintenance")
      ? "manual"
      : "reference";
  for (const id of ["point_software", "extra_production"])
    if (!s.edited.includes(id)) next.inputs[id] = null;
  next.integration = i;
  next.rollout = next.rollout.map((p) => ({
    ...p,
    ramp: p.ramp ?? "reference",
  }));
  return next;
}
export function loadStore(storage: Pick<Storage, "getItem">): {
  store: ScenarioStore;
  error: string | null;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { store: newStore(), error: null };
    const store = parseStore(raw);
    return store
      ? {
          store: { ...store, scenarios: store.scenarios.map(integrateSaved) },
          error: store.scenarios.some((s) => !s.integration)
            ? "Сценарии v0.1 перенесены в v0.2: введённые значения сохранены, оборудование оставлено ручным итогом. Профили запуска и справочные расчёты доступны в настройках."
            : null,
        }
      : {
          store: newStore(),
          error:
            "Сохранённый сценарий имеет неизвестную или повреждённую структуру. Показан рабочий сценарий; исходная запись сохранена до вашего следующего изменения.",
        };
  } catch {
    return {
      store: newStore(),
      error:
        "Хранилище браузера недоступно. Изменения сохраняются только до закрытия страницы.",
    };
  }
}
export function saveStore(
  storage: Pick<Storage, "setItem">,
  store: ScenarioStore,
) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return null;
  } catch {
    return "Не удалось сохранить сценарии. Изменения остаются в открытой странице.";
  }
}
export function duplicateScenario(
  store: ScenarioStore,
  id: string,
): ScenarioStore {
  if (store.scenarios.length >= 30) return store;
  const s = structuredClone(
    store.scenarios.find((s) => s.id === store.activeId)!,
  );
  s.id = id;
  s.name += " — копия";
  s.custom = true;
  return {
    ...store,
    activeId: id,
    scenarios: [...store.scenarios, s],
    compareIds:
      store.compareIds.length < 3
        ? [...store.compareIds, id]
        : store.compareIds,
  };
}
export function deleteScenario(
  store: ScenarioStore,
  id: string,
): ScenarioStore {
  if (!store.scenarios.find((s) => s.id === id)?.custom) return store;
  return {
    ...store,
    activeId: store.activeId === id ? "working-v01" : store.activeId,
    scenarios: store.scenarios.filter((s) => s.id !== id),
    compareIds: store.compareIds.filter((x) => x !== id),
  };
}
