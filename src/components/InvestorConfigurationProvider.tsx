import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  currentBaseObjectFullPreparationConfiguration,
  defaultInvestorConfiguration,
  defaultNetworkScalingConfiguration,
  investorConfigurationIsDefault,
  investorConfigurationStorageKey,
  restoreInvestorConfiguration,
  setSheetInputs,
  type InvestorConfiguration,
  type InvestorScenarioId,
  type NetworkScalingConfiguration,
  type SheetInputs,
} from "../lib/investor-configuration";
import { launchModel, restoreLaunchBudgetState, type LaunchBudgetState } from "../lib/launch-budget";
import { loadSheetInputs, sameSheetInputs, withoutScenarioTraffic } from "../lib/sheet-inputs";

type InvestorConfigurationContextValue = {
  configuration: InvestorConfiguration;
  setScenarioId: (scenarioId: InvestorScenarioId) => void;
  setCustomChecksPerDay: (checksPerDay: number | null) => void;
  setLaunchBudget: (next: LaunchBudgetState | ((current: LaunchBudgetState) => LaunchBudgetState)) => void;
  setNetworkScaling: (next: NetworkScalingConfiguration | ((current: NetworkScalingConfiguration) => NetworkScalingConfiguration)) => void;
  resetConfiguration: () => void;
  resetToCurrentBaseFullPreparation: () => void;
  applyReadyPremisesPreset: () => void;
  requestSheetDefaults: () => void;
};

const InvestorConfigurationContext = createContext<InvestorConfigurationContextValue | null>(null);

function initialConfiguration() {
  try {
    const saved = window.localStorage.getItem(investorConfigurationStorageKey);
    if (saved) return restoreInvestorConfiguration(JSON.parse(saved));
    const legacyLaunchState = window.localStorage.getItem(launchModel.form.local_storage_key);
    if (!legacyLaunchState) return defaultInvestorConfiguration();
    const launchBudget = restoreLaunchBudgetState(JSON.parse(legacyLaunchState));
    return {
      ...defaultInvestorConfiguration(),
      launchBudget,
      networkScaling: defaultNetworkScalingConfiguration(launchBudget),
    };
  } catch {
    return defaultInvestorConfiguration();
  }
}

export function InvestorConfigurationProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState<InvestorConfiguration>(initialConfiguration);
  const [sheetInputsVersion, setSheetInputsVersion] = useState(0);
  const latestConfiguration = useRef(configuration);
  latestConfiguration.current = configuration;

  const sheetDefaultsRequested = useRef(false);

  // Only calculator pages ask for the sheet; the rest of the site never waits for it.
  const [sheetNotice, setSheetNotice] = useState("");
  const appliedSheetInputs = useRef<SheetInputs | null>(null);

  // The backend answers from its copy at once and re-reads the sheet in the background;
  // when it reports a refresh in progress, the page asks again and applies the newer values.
  const applySheetAnswer = useCallback((answer: { inputs: SheetInputs; refreshing: boolean }, announce: boolean) => {
    const inputs = withoutScenarioTraffic(answer.inputs);
    const changed = !appliedSheetInputs.current || !sameSheetInputs(appliedSheetInputs.current, inputs);
    if (changed) {
      // A visitor who has not edited anything follows the sheet; saved edits win.
      const untouched = investorConfigurationIsDefault(latestConfiguration.current);
      appliedSheetInputs.current = inputs;
      setSheetInputs(inputs);
      if (untouched) setConfiguration(defaultInvestorConfiguration());
      setSheetInputsVersion((version) => version + 1);
      if (announce) setSheetNotice("Вводные обновлены из таблицы");
    }
    if (answer.refreshing) {
      window.setTimeout(() => {
        void loadSheetInputs().then((next) => next && applySheetAnswer(next, true));
      }, 5_000);
    }
  }, []);

  const requestSheetDefaults = useCallback(() => {
    if (sheetDefaultsRequested.current) return;
    sheetDefaultsRequested.current = true;
    void loadSheetInputs().then((answer) => answer && applySheetAnswer(answer, false));
  }, [applySheetAnswer]);

  useEffect(() => {
    if (!sheetNotice) return;
    const timer = window.setTimeout(() => setSheetNotice(""), 6_000);
    return () => window.clearTimeout(timer);
  }, [sheetNotice]);

  useEffect(() => {
    try {
      // Untouched defaults are not stored: they must keep following the sheet on the next visit.
      if (investorConfigurationIsDefault(configuration)) window.localStorage.removeItem(investorConfigurationStorageKey);
      else window.localStorage.setItem(investorConfigurationStorageKey, JSON.stringify(configuration));
    } catch {
      // Runtime configuration is optional local state; it never changes canonical project data.
    }
  }, [configuration, sheetInputsVersion]);

  const value = useMemo<InvestorConfigurationContextValue>(() => ({
    configuration,
    setScenarioId: (scenarioId) => setConfiguration(current => ({ ...current, scenarioId })),
    setCustomChecksPerDay: (customChecksPerDay) => setConfiguration(current => ({ ...current, customChecksPerDay })),
    setLaunchBudget: (next) => setConfiguration(current => {
      const launchBudget = typeof next === "function" ? next(current.launchBudget) : next;
      return {
        ...current,
        launchBudget,
        // Legacy point economics still exposes one integrated bar control.
        // It edits the first cohort only; other cohorts remain independent.
        networkScaling: {
          ...current.networkScaling,
          productionGrowEnabled: launchBudget.growEnabled,
          cohorts: current.networkScaling.cohorts.map((cohort, index) => index === 0
            ? { ...cohort, barEnabled: launchBudget.barEnabled }
            : cohort),
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
    resetToCurrentBaseFullPreparation: () => {
      try {
        window.localStorage.removeItem(investorConfigurationStorageKey);
      } catch {
        // The in-memory reset remains available when storage is unavailable.
      }
      setConfiguration(currentBaseObjectFullPreparationConfiguration());
    },
    applyReadyPremisesPreset: () => setConfiguration(defaultInvestorConfiguration()),
    requestSheetDefaults,
  }), [configuration, sheetInputsVersion, requestSheetDefaults]);

  return (
    <InvestorConfigurationContext.Provider value={value}>
      {children}
      {sheetNotice ? <div className="sheet-notice" role="status">{sheetNotice}</div> : null}
    </InvestorConfigurationContext.Provider>
  );
}

export function useInvestorConfiguration() {
  const value = useContext(InvestorConfigurationContext);
  if (!value) throw new Error("useInvestorConfiguration must be used within InvestorConfigurationProvider.");
  const { requestSheetDefaults } = value;
  useEffect(requestSheetDefaults, [requestSheetDefaults]);
  return value;
}
