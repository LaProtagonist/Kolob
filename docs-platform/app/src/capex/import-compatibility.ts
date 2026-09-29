import fs from "node:fs";
import path from "node:path";
import { canonical, sha256 } from "../governance/util.js";

/** Exact legacy dependency view. New opt-in rows never alter existing imports. */
export function legacyFinancialCapexDependencies(snapshot: any) {
  return {
    scenarios: snapshot.scenarios,
    businessCapacity: snapshot.businessCapacity,
    modules: snapshot.modules,
    moduleItems: snapshot.moduleItems.filter((row: any) => !row.condition?.startsWith("retail_complete")),
    pilotConfiguration: snapshot.pilotConfiguration,
    configurationTemplate: snapshot.configurationTemplate,
    investorStartModel: snapshot.investorStartModel,
    pilotEconomics: snapshot.pilotEconomics,
    overrides: snapshot.overrides,
    items: snapshot.items.filter((item: any) => !item.compositionProfile).map((item: any) => {
      const { costKind, cashReserveRub, compositionProfile, ...legacy } = item;
      return legacy;
    }),
  };
}

/** A historical pin is accepted only while every legacy dependency is identical. */
export function compatibleFinancialCapexImport(root: string, importedState: string) {
  try {
    const pin = JSON.parse(fs.readFileSync(path.join(root, "docs-platform/working/capex-financial-import-pin.json"), "utf8"));
    if (pin.importedContentStateSha256 !== importedState) return false;
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, "src/content/capex-configurator-data.json"), "utf8"));
    return sha256(canonical(legacyFinancialCapexDependencies(snapshot))) === pin.dependenciesSha256;
  } catch { return false; }
}
