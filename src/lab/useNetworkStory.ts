import { useMemo } from "react";
import { useInvestorConfiguration } from "../components/InvestorConfigurationProvider";
import {
  applyNetworkRolloutPreset,
  currentNetworkRolloutSize,
  investorScenarioIds,
  type InvestorScenarioId,
} from "../lib/investor-configuration";
import type { NetworkRolloutSize } from "../lib/network-planning";
import { applyStoryPlan, buildNetworkStory, type NetworkStory, type StoryPlanEntry } from "./story";

export type StoryControls = {
  /** Сколько дополнительных точек открывает сеть: 4, 8 или 12; "custom" — состав изменён в калькуляторе. */
  rolloutSize: NetworkRolloutSize | "custom";
  setRolloutSize: (size: NetworkRolloutSize) => void;
  scenarioId: InvestorScenarioId;
  scenarioIds: readonly InvestorScenarioId[];
  setScenarioId: (scenarioId: InvestorScenarioId) => void;
  /**
   * Свой план открытий: для каждого названного района — месяцы, в которые открываются его точки.
   * Расчётный план возвращает setRolloutSize.
   */
  setPlan: (plan: StoryPlanEntry[]) => void;
  /** Вернуть всё к значениям из таблицы вводных. */
  reset: () => void;
};

export type VariantProps = { story: NetworkStory; controls: StoryControls };

/**
 * Состояние общее с калькулятором инвестора: то, что изменено здесь, видно там, и наоборот.
 * Вводные из Google Таблицы приходят тем же путём, что и в калькулятор.
 */
export function useNetworkStory(): VariantProps {
  const { configuration, setNetworkScaling, setScenarioId, setCustomChecksPerDay, resetConfiguration } = useInvestorConfiguration();
  const story = useMemo(() => buildNetworkStory(configuration), [configuration]);
  const controls = useMemo<StoryControls>(() => ({
    rolloutSize: currentNetworkRolloutSize(configuration.networkScaling),
    setRolloutSize: (size) => setNetworkScaling((current) => applyNetworkRolloutPreset(current, configuration.launchBudget, size)),
    setPlan: (plan) => setNetworkScaling((current) => applyStoryPlan(current, plan)),
    scenarioId: configuration.scenarioId,
    scenarioIds: investorScenarioIds,
    setScenarioId: (scenarioId) => {
      setScenarioId(scenarioId);
      setCustomChecksPerDay(null);
    },
    reset: resetConfiguration,
  }), [configuration, resetConfiguration, setCustomChecksPerDay, setNetworkScaling, setScenarioId]);
  return { story, controls };
}
