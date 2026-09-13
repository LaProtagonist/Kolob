import source from "../../docs-platform/working/franchise-model-v0.1.json";
import {
  defaultIntegration,
  integrationParameters,
  inputState,
  referenceValues,
  v02Config,
} from "./franchise-model-data";
import type {
  Parameter,
  Scenario,
  ScenarioStore,
} from "./franchise-model-types";
export const parameters = [
  ...(source.parameters as Parameter[]),
  ...integrationParameters,
];
export const reference = Object.freeze(source.reference);
export const STORAGE_KEY = "kolobochnaya.control.franchise-model.v1";
export const statusLabels = {
  CONFIRMED: "Подтверждено",
  WORKING: "Рабочая гипотеза",
  REFERENCE: "Ориентир",
  MISSING: "Требуется определить",
  DERIVED: "Рассчитано",
  NOT_APPLICABLE: "Не применяется",
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
/** v0.1 remains a reproducible fixture; the current workbench starts a separate v0.2 scenario. */
export function workingScenarioV2(): Scenario {
  const s = workingScenario();
  s.name = v02Config.name;
  s.integration = defaultIntegration();
  for (const [id, value] of Object.entries(referenceValues))
    if (id in s.inputs) s.inputs[id] = value;
  s.inputs.point_software = null;
  s.inputs.extra_production = null;
  // Reference tax inputs enable shadow evaluation; legal confirmation remains a methodological limitation.
  s.rollout = s.rollout.map((p) => ({ ...p, ramp: "reference" }));
  return s;
}
export function newStore(): ScenarioStore {
  return {
    schemaVersion: 1,
    activeId: "working-v01",
    compareIds: ["working-v01"],
    scenarios: [workingScenarioV2()],
  };
}
export function parameterStatus(s: Scenario, id: string) {
  if (s.integration) {
    if (
      ["tax_profit", "tax_sales"].includes(id) &&
      s.integration.taxMode === "reference" &&
      !s.edited.includes(id)
    )
      return "REFERENCE";
    const state = inputState(
      s,
      parameters.find((p) => p.id === id)!,
    );
    return state.kind === "not_applicable"
      ? "NOT_APPLICABLE"
      : state.kind === "missing"
        ? "MISSING"
        : state.status;
  }
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
    inputs: {
      ...s.inputs,
      [id]: s.integration
        ? workingScenarioV2().inputs[id]
        : parameters.find((p) => p.id === id)!.value,
    },
    edited: s.edited.filter((x) => x !== id),
  };
}
