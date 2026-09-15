import { WORKOUTS_PER_WEEK } from "./seasonEngine";

/**
 * Mirrors nudgeFor in MySeason.tsx. Kept as a table of the cases that matter so
 * a wording change can't quietly turn "you're short" into silence.
 */
type Tone = "owed" | "skip" | "clean";

const nudge = (done: number, daysLeft: number, outstanding = 0): Tone | null => {
  if (outstanding > 0) return "owed";
  const left = WORKOUTS_PER_WEEK - done;
  if (left <= 0) return "clean";
  if (left > daysLeft) return "owed";
  if (left === daysLeft) return "skip";
  return null;
};

describe("the weekly nudge", () => {
  test("stays quiet when there is comfortably enough time", () => {
    expect(nudge(1, 6)).toBeNull();
  });

  test("warns when every remaining day is needed", () => {
    expect(nudge(1, 3)).toBe("skip");
  });

  test("escalates when the week can no longer be saved", () => {
    expect(nudge(1, 2)).toBe("owed");
  });

  test("congratulates a clean week", () => {
    // Exactly the threshold is clean — the boundary, not one past it.
    expect(nudge(WORKOUTS_PER_WEEK, 1)).toBe("clean");
    expect(nudge(7, 0)).toBe("clean");
  });

  test("money owed outranks anything about workouts", () => {
    expect(nudge(WORKOUTS_PER_WEEK, 4, 500)).toBe("owed");
  });

  test("money owed outranks the week — nobody is ever silenced now", () => {
    expect(nudge(0, 1, 1500)).toBe("owed");
    expect(nudge(WORKOUTS_PER_WEEK, 1, 1500)).toBe("owed");
  });
});
