import source from "../../docs-platform/working/franchise-model-v0.1.json";
import type {
  Parameter,
  Scenario,
  ScenarioStore,
} from "./franchise-model-types";
export const parameters = source.parameters as Parameter[];
export const reference = Object.freeze(source.reference);
export const STORAGE_KEY = "kolobochnaya.control.franchise-model.v1";
export const statusLabels = {
  CONFIRMED: "Подтверждено",
  WORKING: "Рабочая гипотеза",
  REFERENCE: "Ориентир",
  MISSING: "Требуется определить",
  DERIVED: "Рассчитано",
};
export function workingScenario(): Scenario {
  return {
    schemaVersion: 1,
    id: "working-v01",
    name: source.name,
    custom: false,
    inputs: Object.fromEntries(parameters.map((p) => [p.id, p.value])),
    edited: [],
    rollout: structuredClone(source.rollout) as Scenario["rollout"],
    expansions: [],
    capitalCalls: [],
  };
}
export function newStore(): ScenarioStore {
  return {
    schemaVersion: 1,
    activeId: "working-v01",
    compareIds: ["working-v01"],
    scenarios: [workingScenario()],
  };
}
export function parameterStatus(s: Scenario, id: string) {
  if (s.inputs[id] === null) return "MISSING";
  return s.edited.includes(id)
    ? "WORKING"
    : parameters.find((p) => p.id === id)!.status;
}
export function setInput(
  s: Scenario,
  id: string,
  value: number | null,
): Scenario {
  return {
    ...s,
    inputs: { ...s.inputs, [id]: value },
    edited: [...new Set([...s.edited, id])],
  };
}
export function resetInput(s: Scenario, id: string): Scenario {
  return {
    ...s,
    inputs: { ...s.inputs, [id]: parameters.find((p) => p.id === id)!.value },
    edited: s.edited.filter((x) => x !== id),
  };
}
