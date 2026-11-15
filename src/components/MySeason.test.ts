import { cleanRun, pendingCredit } from "./MySeason";
import { WorkoutDay, WorkoutKind } from "../types";

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

/**
 * The count beside the grid now reads the taps that have not landed yet, which
 * means it can be counted twice: the reload that confirms a tap and the clearing
 * of that tap are two separate state changes, and a render can fall between
 * them. A week reading clean on four workouts is a fine that should have been
 * billed and a burst of confetti nobody earned.
 */
const day = (dayOfWeek: number, kind: WorkoutKind | null, week = 3): WorkoutDay =>
  ({
    id: `w${week}d${dayOfWeek}`,
    userId: "anya",
    week,
    dayOfWeek,
    date: "2026-11-09",
    isCompleted: kind !== null,
    kind: kind ?? "session",
    workoutType: "gym",
    markedBy: "user",
    timestamp: "2026-11-09T06:00:00.000Z",
  }) as WorkoutDay;

describe("pendingCredit", () => {
  it("is nothing when nothing is in the air", () => {
    expect(pendingCredit({}, [day(1, "session")], "anya", 3)).toBe(0);
  });

  it("counts a workout that has not landed yet", () => {
    expect(pendingCredit({ "3:2": "session" }, [], "anya", 3)).toBe(1);
  });

  it("counts a step day as half of one", () => {
    expect(pendingCredit({ "3:2": "steps" }, [], "anya", 3)).toBe(0.5);
  });

  it("takes credit back when a day is being cleared", () => {
    expect(pendingCredit({ "3:1": null }, [day(1, "session")], "anya", 3)).toBe(-1);
  });

  it("counts only the difference when a workout becomes a step day", () => {
    expect(pendingCredit({ "3:1": "steps" }, [day(1, "session")], "anya", 3)).toBe(-0.5);
  });

  it("stops counting the moment the server agrees — never twice", () => {
    expect(pendingCredit({ "3:1": "session" }, [day(1, "session")], "anya", 3)).toBe(0);
    expect(pendingCredit({ "3:1": null }, [day(1, null)], "anya", 3)).toBe(0);
  });

  it("ignores a correction to an earlier week", () => {
    expect(pendingCredit({ "2:1": "session" }, [], "anya", 3)).toBe(0);
  });

  it("ignores somebody else's row", () => {
    const theirs = { ...day(1, "session"), userId: "kabir" } as WorkoutDay;
    expect(pendingCredit({ "3:1": "session" }, [theirs], "anya", 3)).toBe(1);
  });

  it("adds up several taps in the air at once", () => {
    expect(pendingCredit({ "3:1": "session", "3:2": "steps" }, [], "anya", 3)).toBe(1.5);
  });
});
