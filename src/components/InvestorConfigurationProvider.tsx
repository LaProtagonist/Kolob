import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultInvestorConfiguration,
  investorConfigurationStorageKey,
  restoreInvestorConfiguration,
  type InvestorConfiguration,
  type InvestorScenarioId,
} from "../lib/investor-configuration";
import { launchModel, restoreLaunchBudgetState, type LaunchBudgetState } from "../lib/launch-budget";

type InvestorConfigurationContextValue = {
  configuration: InvestorConfiguration;
  setScenarioId: (scenarioId: InvestorScenarioId) => void;
  setLaunchBudget: (next: LaunchBudgetState | ((current: LaunchBudgetState) => LaunchBudgetState)) => void;
  resetConfiguration: () => void;
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
    setLaunchBudget: (next) => setConfiguration(current => ({
      ...current,
      launchBudget: typeof next === "function" ? next(current.launchBudget) : next,
    })),
    resetConfiguration: () => {
      try {
        window.localStorage.removeItem(investorConfigurationStorageKey);
      } catch {
        // The in-memory reset remains available when storage is unavailable.
      }
      setConfiguration(defaultInvestorConfiguration());
    },
  }), [configuration]);

  return <InvestorConfigurationContext.Provider value={value}>{children}</InvestorConfigurationContext.Provider>;
}

export function useInvestorConfiguration() {
  const value = useContext(InvestorConfigurationContext);
  if (!value) throw new Error("useInvestorConfiguration must be used within InvestorConfigurationProvider.");
  return value;
}
