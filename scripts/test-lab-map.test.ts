/**
 * Карта центра Петербурга для лаборатории: данные на месте, точки сети стоят на суше внутри рамки.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyNetworkRolloutPreset, defaultInvestorConfiguration } from "../src/lib/investor-configuration";
import { buildNetworkStory } from "../src/lab/story";
import { city, cityHouses, distanceToRoad, findSpot, housesClearOf, inPark, mapCredit, onWater, placeOnMap, project } from "../src/lab/shared/geo/geo";

const inside = (x: number, y: number) => x >= city.frame.x && x <= city.frame.x + city.frame.w && y >= city.frame.y && y <= city.frame.y + city.frame.h;

test("the map file has water with islands, parks, avenues, bridges and the credit to OpenStreetMap", () => {
  assert.ok(city.water.length > 20, "вода");
  assert.ok(city.water.some((polygon) => polygon.length > 1), "острова — дыры в воде");
  assert.ok(city.parks.length > 20, "сады");
  assert.ok(city.roads.some((road) => road.name === "Невский проспект"), "Невский");
  assert.ok(city.roads.some((road) => road.bridge && road.name === "Дворцовый мост"), "Дворцовый мост");
  assert.match(city.source, /OpenStreetMap/);
  assert.match(mapCredit, /OpenStreetMap/);
});

test("landmarks and labels sit inside the frame; water labels sit on water", () => {
  for (const landmark of city.landmarks) assert.ok(inside(landmark.x, landmark.y), landmark.title);
  for (const label of city.labels) {
    assert.ok(inside(label.x, label.y), label.text);
    if (label.kind !== "district") assert.ok(onWater(label.x, label.y), `${label.text} на воде`);
  }
  // Ось y идёт на юг: Петропавловская крепость севернее Исаакиевского собора.
  const fortress = city.landmarks.find((item) => item.id === "fortress")!;
  const isaac = city.landmarks.find((item) => item.id === "isaac")!;
  assert.ok(fortress.y < isaac.y);
  const [x, y] = project(59.9502, 30.31647);
  assert.ok(Math.abs(x - fortress.x) <= 1 && Math.abs(y - fortress.y) <= 1);
});

test("every network point of every rollout stands on land inside the frame, apart from the others", () => {
  for (const size of [4, 8, 12] as const) {
    const base = defaultInvestorConfiguration();
    const configuration = { ...base, networkScaling: applyNetworkRolloutPreset(base.networkScaling, base.launchBudget, size) };
    const placed = placeOnMap(buildNetworkStory(configuration).points);
    for (const item of placed) {
      assert.ok(inside(item.x, item.y), `${item.point.title} внутри рамки`);
      assert.ok(!onWater(item.x, item.y), `${item.point.title} не в воде`);
    }
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        assert.ok(Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y) >= 150, `${placed[a].point.title} и ${placed[b].point.title} не друг на друге`);
      }
    }
  }
});

test("houses stand in city blocks: fewer than blocks, not on water, parks, avenues or landmark squares", () => {
  const houses = cityHouses();
  assert.ok(houses.length > 500 && houses.length < 2000, `домов ${houses.length}`);
  for (const house of houses) {
    assert.ok(inside(house.x, house.y));
    assert.ok(!onWater(house.x, house.y), "не в воде");
    assert.ok(!inPark(house.x, house.y), "не в саду");
    assert.ok(distanceToRoad(house.x, house.y) >= 45, "не на проспекте");
    assert.ok(city.landmarks.every((landmark) => Math.hypot(landmark.x - house.x, landmark.y - house.y) >= 260), "не на площади");
  }
  const clear: Array<[number, number]> = [[houses[0].x, houses[0].y]];
  assert.equal(housesClearOf(houses, clear).length, houses.length - houses.filter((house) => Math.hypot(house.x - clear[0][0], house.y - clear[0][1]) < 170).length);
});

test("a free spot for a new point is on land and apart from the taken ones", () => {
  const [cx, cy] = project(59.9341, 30.3318);
  const taken: Array<[number, number]> = [[cx, cy]];
  for (let order = 1; order < 4; order += 1) {
    const [x, y] = findSpot(cx, cy, order, taken);
    assert.ok(!onWater(x, y));
    assert.ok(taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) >= 180));
    taken.push([x, y]);
  }
});
