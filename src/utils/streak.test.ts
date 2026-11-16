import { cleanRun, flameMilestone, flameTier, heatClass } from "./streak";

const season = (outcomes: string[]) => outcomes.map((outcome, i) => ({ week: i + 1, outcome }));
const runs = (outcomes: string[]) => [...cleanRun(season(outcomes)).values()];

describe("cleanRun", () => {
  it("counts consecutive clean weeks", () => {
    expect(runs(["clean", "clean", "clean"])).toEqual([1, 2, 3]);
  });

  it("starts again after a miss", () => {
    expect(runs(["clean", "clean", "missed", "clean"])).toEqual([1, 2, 0, 1]);
  });

  it("carries a run across an excused week without extending it", () => {
    expect(runs(["clean", "excused", "clean"])).toEqual([1, 0, 2]);
  });

  it("does not let an excused week start a run", () => {
    expect(runs(["excused", "clean"])).toEqual([0, 1]);
  });

  it("reads weeks in order whatever order they arrive in", () => {
    const shuffled = [
      { week: 3, outcome: "clean" },
      { week: 1, outcome: "clean" },
      { week: 2, outcome: "clean" },
    ];
    expect(cleanRun(shuffled).get(3)).toBe(3);
  });

  it("has nothing to say about an empty season", () => {
    expect(cleanRun([]).size).toBe(0);
  });
});

describe("heatClass", () => {
  it("deepens with the run, and stops at three", () => {
    expect([1, 2, 3, 9].map(heatClass)).toEqual(["bg-clean-500", "bg-clean-600", "bg-clean-700", "bg-clean-700"]);
  });
});

describe("flameTier / flameMilestone", () => {
  it("steps at 1, 3, 6 and 12 weeks", () => {
    expect([0, 1, 2, 3, 5, 6, 11, 12, 24].map(flameTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("bursts when a streak crosses into 3, 6 or 12", () => {
    expect(flameMilestone(2, 3)).toBe(true);
    expect(flameMilestone(5, 6)).toBe(true);
    expect(flameMilestone(11, 12)).toBe(true);
  });

  it("stays quiet for the first flame, inside a tier, or on a drop", () => {
    expect(flameMilestone(0, 1)).toBe(false);
    expect(flameMilestone(3, 4)).toBe(false);
    expect(flameMilestone(6, 2)).toBe(false);
  });
});
