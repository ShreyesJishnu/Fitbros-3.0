import { kindOn, takeoverForTap } from "./takeover";
import { WorkoutDay } from "../types";

const row = (over: Partial<WorkoutDay>): WorkoutDay =>
  ({ id: "x", userId: "anya", week: 11, dayOfWeek: 3, isCompleted: true, date: "", markedBy: "user", ...over } as WorkoutDay);

describe("kindOn", () => {
  it("reads a session, a walk, or nothing", () => {
    expect(kindOn([row({ kind: "session" })], "anya", 11, 3)).toBe("session");
    expect(kindOn([row({ kind: "steps" })], "anya", 11, 3)).toBe("steps");
    expect(kindOn([], "anya", 11, 3)).toBe("none");
  });

  it("treats an old row with no kind as a session, as the engine does", () => {
    expect(kindOn([row({ kind: undefined })], "anya", 11, 3)).toBe("session");
  });

  it("ignores a cleared day and other people's rows", () => {
    expect(kindOn([row({ isCompleted: false })], "anya", 11, 3)).toBe("none");
    expect(kindOn([row({ userId: "dev" })], "anya", 11, 3)).toBe("none");
  });
});

describe("takeoverForTap", () => {
  // Wednesday: today index 2, dayOfWeek 3.
  it("plays today's tap with no day label", () => {
    expect(takeoverForTap({ live: true, dayOfWeek: 3, today: 2, next: "steps" })).toEqual({ kind: "steps", day: undefined });
  });

  it("names the day when an earlier day this week is logged", () => {
    expect(takeoverForTap({ live: true, dayOfWeek: 1, today: 2, next: "session" })).toEqual({ kind: "session", day: "Mon" });
  });

  it("shows not done when a day is cleared", () => {
    expect(takeoverForTap({ live: true, dayOfWeek: 3, today: 2, next: null })?.kind).toBe("none");
  });

  it("stays out of days ahead and earlier weeks", () => {
    expect(takeoverForTap({ live: true, dayOfWeek: 4, today: 2, next: "session" })).toBeNull();
    expect(takeoverForTap({ live: false, dayOfWeek: 1, today: 2, next: "session" })).toBeNull();
  });
});
