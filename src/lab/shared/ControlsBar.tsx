import { scenarioTitles } from "../format";
import type { StoryControls } from "../useNetworkStory";

/** Общие переключатели: сценарий потока гостей, размер сети, сброс к таблице вводных. */
export function ControlsBar({ controls }: { controls: StoryControls }) {
  return (
    <div className="lab-controls">
      <div className="lab-segment" role="group" aria-label="Сценарий">
        {controls.scenarioIds.map((id) => (
          <button key={id} type="button" className={id === controls.scenarioId ? "is-selected" : ""} onClick={() => controls.setScenarioId(id)}>
            {scenarioTitles[id]}
          </button>
        ))}
      </div>
      <div className="lab-segment" role="group" aria-label="Дополнительных точек">
        {([4, 8, 12] as const).map((size) => (
          <button key={size} type="button" className={size === controls.rolloutSize ? "is-selected" : ""} onClick={() => controls.setRolloutSize(size)}>
            +{size} точек
          </button>
        ))}
      </div>
      <button className="lab-reset" type="button" onClick={controls.reset}>Сбросить</button>
    </div>
  );
}
