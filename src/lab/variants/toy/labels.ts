import type { StoryPoint } from "../../story";
import type { HouseKind } from "./pieces";

export const locationTitles: Record<StoryPoint["locationType"], string> = {
  street: "Улица",
  foodhall: "Фудхолл",
  creative_cluster: "Креативный кластер",
  foodtruck: "Фудтрак",
};

/** Вид домика: первая точка с производством, точка с залом или точка на вынос. */
export const houseKind = (point: Pick<StoryPoint, "format"> & { isBase?: boolean }): HouseKind => (point.isBase ? "base" : point.format === "with_seating" ? "seating" : "takeaway");

export function plural(count: number, one: string, few: string, many: string) {
  const tail = Math.abs(count) % 100;
  if (tail >= 11 && tail <= 14) return many;
  return tail % 10 === 1 ? one : tail % 10 >= 2 && tail % 10 <= 4 ? few : many;
}
