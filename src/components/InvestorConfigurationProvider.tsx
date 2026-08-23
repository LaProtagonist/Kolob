import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  canonicalInvestorConfiguration,
  defaultInvestorConfiguration,
  investorConfigurationStorageKey,
  restoreInvestorConfiguration,
  type InvestorConfiguration,
  type InvestorScenarioId,
  type NetworkScalingConfiguration,
} from "../lib/investor-configuration";
import { launchModel, restoreLaunchBudgetState, type LaunchBudgetState } from "../lib/launch-budget";

type InvestorConfigurationContextValue = {
  configuration: InvestorConfiguration;
  setScenarioId: (scenarioId: InvestorScenarioId) => void;
  setCustomChecksPerDay: (checksPerDay: number | null) => void;
  setLaunchBudget: (next: LaunchBudgetState | ((current: LaunchBudgetState) => LaunchBudgetState)) => void;
  setNetworkScaling: (next: NetworkScalingConfiguration | ((current: NetworkScalingConfiguration) => NetworkScalingConfiguration)) => void;
  resetConfiguration: () => void;
  resetToCanonicalConfiguration: () => void;
  applyReadyPremisesPreset: () => void;
};

const InvestorConfigurationContext = createContext<InvestorConfigurationContextValue | null>(null);

function initialConfiguration() {
  try {
    const saved = window.localStorage.getItem(investorConfigurationStorageKey);
    if (saved) return restoreInvestorConfiguration(JSON.parse(saved));
    const legacyLaunchState = window.localStorage.getItem(launchModel.form.local_storage_key);
    return legacyLaunchState
      ? { ...defaultInvestorConfiguration(), launchBudget: restoreLaunchBudgetState(JSON.parse(legacyLaunchState)) }
      : defaultInvestorConfiguration();
  } catch {
    return defaultInvestorConfiguration();
  }
}

export function InvestorConfigurationProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState<InvestorConfiguration>(initialConfiguration);

  useEffect(() => {
    try {
      window.localStorage.setItem(investorConfigurationStorageKey, JSON.stringify(configuration));
    } catch {
      // Runtime configuration is optional local state; it never changes canonical project data.
    }
  }, [configuration]);

  const value = useMemo<InvestorConfigurationContextValue>(() => ({
    configuration,
    setScenarioId: (scenarioId) => setConfiguration(current => ({ ...current, scenarioId })),
    setCustomChecksPerDay: (customChecksPerDay) => setConfiguration(current => ({ ...current, customChecksPerDay })),
    setLaunchBudget: (next) => setConfiguration(current => {
      const launchBudget = typeof next === "function" ? next(current.launchBudget) : next;
      return {
        ...current,
        launchBudget,
        // Legacy launch pages still edit the shared integrated configuration.
        // Keep the two module flags aligned while the network point selector is
        // introduced incrementally.
        networkScaling: {
          ...current.networkScaling,
          pointBarEnabled: launchBudget.barEnabled,
          productionGrowEnabled: launchBudget.growEnabled,
        },
      };
    }),
    setNetworkScaling: (next) => setConfiguration(current => ({
      ...current,
      networkScaling: typeof next === "function" ? next(current.networkScaling) : next,
    })),
    resetConfiguration: () => {
      try {
        window.localStorage.removeItem(investorConfigurationStorageKey);
      } catch {
        // The in-memory reset remains available when storage is unavailable.
      }
      setConfiguration(defaultInvestorConfiguration());
    },
    resetToCanonicalConfiguration: () => {
      try {
        window.localStorage.removeItem(investorConfigurationStorageKey);
      } catch {
        // The in-memory reset remains available when storage is unavailable.
      }
      setConfiguration(canonicalInvestorConfiguration());
    },
    applyReadyPremisesPreset: () => setConfiguration(defaultInvestorConfiguration()),
  }), [configuration]);

  return <InvestorConfigurationContext.Provider value={value}>{children}</InvestorConfigurationContext.Provider>;
}

export function useInvestorConfiguration() {
  const value = useContext(InvestorConfigurationContext);
  if (!value) throw new Error("useInvestorConfiguration must be used within InvestorConfigurationProvider.");
  return value;
}
