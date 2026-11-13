import { cleanRun } from "./MySeason";

/**
 * The strip colours a clean week by how deep into a run it sits, and the one
 * thing that is easy to get wrong is the excused week: it has to carry a run
 * across without extending it, or an injury would either reset somebody to
 * nothing or hand them a week they never trained.
 */
const season = (outcomes: string[]) => outcomes.map((outcome) => ({ outcome }));

describe("cleanRun", () => {
  it("counts consecutive clean weeks", () => {
    expect(cleanRun(season(["clean", "clean", "clean"]))).toEqual([1, 2, 3]);
  });

  it("starts again after a miss", () => {
    expect(cleanRun(season(["clean", "clean", "missed", "clean"]))).toEqual([1, 2, 0, 1]);
  });

  it("carries a run across an excused week without extending it", () => {
    expect(cleanRun(season(["clean", "excused", "clean"]))).toEqual([1, 0, 2]);
  });

  it("does not let an excused week start a run", () => {
    expect(cleanRun(season(["excused", "clean"]))).toEqual([0, 1]);
  });

  it("has nothing to say about an empty season", () => {
    expect(cleanRun([])).toEqual([]);
  });
});
