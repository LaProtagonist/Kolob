import { economicsData } from "./economics";
import { investorScenarioIds, type SheetInputs } from "./investor-configuration";

const inputsUrl = "/api/inputs";
const requestTimeoutMs = 6_000;

/**
 * Reads the «Вводные» sheet through the site backend. Any failure resolves to
 * null so the page keeps the defaults built into the bundle: prerender, tests
 * and a missing backend must render exactly as before.
 */
export type SheetInputsAnswer = { inputs: SheetInputs; refreshing: boolean };

export async function loadSheetInputs(): Promise<SheetInputsAnswer | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(inputsUrl, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return null;
    const payload = await response.json() as { ok?: unknown; source?: unknown; refreshing?: unknown; inputs?: unknown };
    if (payload.ok !== true || payload.source === "defaults") return null;
    if (!payload.inputs || typeof payload.inputs !== "object" || Array.isArray(payload.inputs)) return null;
    return { inputs: payload.inputs as SheetInputs, refreshing: payload.refreshing === true };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Traffic equal to the scenario's own value stays "by scenario", as when typed on the page. */
export function withoutScenarioTraffic(inputs: SheetInputs): SheetInputs {
  const scenarioId = investorScenarioIds.find((id) => id === inputs.scenario_default) ?? "realistic";
  if (inputs.checks_per_day !== economicsData.scenariosById[scenarioId].checksPerDay) return inputs;
  const { checks_per_day: _scenarioTraffic, ...rest } = inputs;
  return rest;
}

export function sameSheetInputs(left: SheetInputs, right: SheetInputs) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.every((key) => String(left[key as keyof SheetInputs] ?? "") === String(right[key as keyof SheetInputs] ?? ""));
}
