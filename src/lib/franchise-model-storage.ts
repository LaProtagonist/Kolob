import { newStore, parameters, STORAGE_KEY } from "./franchise-model-scenario";
import type { Scenario, ScenarioStore } from "./franchise-model-types";
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
export function loadStore(storage: Pick<Storage, "getItem">): {
  store: ScenarioStore;
  error: string | null;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { store: newStore(), error: null };
    const store = parseStore(raw);
    return store
      ? { store, error: null }
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
