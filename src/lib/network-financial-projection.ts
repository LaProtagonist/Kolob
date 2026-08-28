/**
 * Single consumer adapter for the Current Base + Network Expansion model.
 *
 * It owns orchestration only. Revenue, OPEX, tax, depreciation, maintenance
 * and FCF remain in the shared financial primitives and governed source
 * adapters; this module must not acquire its own financial formula.
 */
import type { ConfiguredEconomicsScenario } from "./configured-economics";
import type { InvestorConfiguration } from "./investor-configuration";
import {
  networkEconomicsProjection,
  networkScalingProjection,
  type BaseObjectFinancialProjection,
} from "./network-scaling";
import { networkTemporalProjection, type NetworkTemporalOptions } from "./network-temporal";

export function networkFinancialProjection(
  configuration: InvestorConfiguration,
  baseObject: BaseObjectFinancialProjection,
  scenario: Pick<ConfiguredEconomicsScenario, "cashFlows" | "monthlyProjection">,
  temporalOptions: NetworkTemporalOptions = {},
) {
  const scaling = networkScalingProjection(configuration);
  const economics = networkEconomicsProjection(configuration, baseObject, scaling);
  const temporal = networkTemporalProjection(configuration, baseObject, scenario, scaling, temporalOptions);
  return {
    provenance: temporal.provenance,
    scaling,
    economics,
    temporal,
    // Temporal coverage is the consumer-facing status: it includes the
    // steady-state structural gaps plus rollout-period contract gaps.
    coverage: temporal.coverage,
    status: temporal.status,
    warnings: temporal.warnings,
    exclusions: temporal.exclusions,
  };
}

export type NetworkFinancialProjection = ReturnType<typeof networkFinancialProjection>;
