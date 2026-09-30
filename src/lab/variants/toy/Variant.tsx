import type { VariantProps } from "../../useNetworkStory";

/** Заготовка: этот вариант графики ещё не нарисован. Данные уже приходят. */
export default function Variant({ story }: VariantProps) {
  return (
    <div className="lab-placeholder">
      <h2>Вариант в работе</h2>
      <p>Данные сети готовы: точек {story.totals.pointCount}, месяцев в расчёте {story.months.length}. Графика для этого варианта ещё не нарисована.</p>
    </div>
  );
}
