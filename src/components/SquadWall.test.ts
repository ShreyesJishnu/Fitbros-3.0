import { SquadRow, squadHealth, squadPulse, weekDays, weekPeek } from "./SquadWall";
import { liveStreak, streakAtRisk } from "../utils/streak";

type Outcome = "clean" | "missed" | "excused";

const row = (outcomes: Outcome[], over: Partial<SquadRow> = {}): SquadRow => ({
  userId: "u",
  name: "Ancil",
  weeks: outcomes.map((outcome, i) => ({ week: i + 1, outcome, credits: 0, fine: 0 })),
  currentWeekProgress: { week: outcomes.length + 1, credits: 0, needed: 4 },
  cleanStreak: 0,
  cleanWeeks: 0,
  ...over,
});

describe("squadPulse", () => {
  it("counts clean weeks out of the players each week was judged for", () => {
    const rows = [row(["clean", "missed"]), row(["clean", "excused"]), row(["missed", "clean"])];
    expect(squadPulse(rows, 3)).toEqual([
      { week: 1, clean: 2, judged: 3 },
      // The excused player is left out of week 2 rather than counted as a miss.
      { week: 2, clean: 1, judged: 2 },
    ]);
  });

  it("leaves out a player who joined after the week", () => {
    const late = row([], { weeks: [{ week: 2, outcome: "clean", credits: 4, fine: 0 }] });
    expect(squadPulse([late], 3)[0]).toEqual({ week: 1, clean: 0, judged: 0 });
  });

  it("gives health as one share across the season, and none before a week closes", () => {
    const rows = [row(["clean", "missed"]), row(["clean", "clean"])];
    expect(squadHealth(squadPulse(rows, 3))).toBe(75);
    expect(squadHealth(squadPulse(rows, 1))).toBeNull();
  });
});

describe("streak", () => {
  const progress = (credits: number) => ({ credits, needed: 4 });

  it("adds the running week the moment it is clean", () => {
    expect(liveStreak({ cleanStreak: 3, currentWeekProgress: progress(3.5) })).toBe(3);
    expect(liveStreak({ cleanStreak: 3, currentWeekProgress: progress(4) })).toBe(4);
  });

  it("shows the hourglass from Friday, only on a streak this week has not secured", () => {
    const open = { cleanStreak: 2, currentWeekProgress: progress(1) };
    expect(streakAtRisk(open, 3)).toBe(false); // Thursday
    expect(streakAtRisk(open, 4)).toBe(true); // Friday
    expect(streakAtRisk({ cleanStreak: 2, currentWeekProgress: progress(4) }, 6)).toBe(false);
    expect(streakAtRisk({ cleanStreak: 0, currentWeekProgress: progress(0) }, 6)).toBe(false);
  });
});

describe("weekPeek", () => {
  const r = row(["clean", "clean", "missed", "excused"], {
    weeks: [
      { week: 1, outcome: "clean", credits: 4, fine: 0 },
      { week: 2, outcome: "clean", credits: 5, fine: 0 },
      { week: 3, outcome: "missed", credits: 2.5, fine: 400 },
      { week: 4, outcome: "excused", credits: 0, fine: 0 },
    ],
    currentWeekProgress: { week: 5, credits: 1.5, needed: 4 },
  });

  it("says a clean week's credits and the run it was part of", () => {
    expect(weekPeek(r, 1, 5)).toMatchObject({ status: "Clean", detail: "4 of 4 credits" });
    expect(weekPeek(r, 2, 5)).toMatchObject({ status: "Clean", detail: "5 of 4 credits · 2 clean in a row" });
  });

  it("names the fine on a missed week", () => {
    expect(weekPeek(r, 3, 5)).toMatchObject({ status: "Fined ₹400", detail: "2.5 of 4 credits", tone: "owed" });
  });

  it("calls an excused week away, not judged", () => {
    expect(weekPeek(r, 4, 5)).toMatchObject({ status: "Away", tone: "muted" });
  });

  it("shows the running week as progress", () => {
    expect(weekPeek(r, 5, 5)).toMatchObject({ status: "2.5 to go", detail: "1.5 of 4 credits so far" });
  });

  it("marks weeks before a player joined", () => {
    const late = row([], { weeks: [{ week: 3, outcome: "clean", credits: 4, fine: 0 }] });
    expect(weekPeek(late, 1, 4).status).toBe("Not in yet");
  });
});

describe("weekDays", () => {
  const day = (userId: string, week: number, dayOfWeek: number, extra: object = {}) =>
    ({ id: `${userId}${week}${dayOfWeek}`, userId, week, dayOfWeek, date: "", isCompleted: true, markedBy: "user", timestamp: "", ...extra }) as any;

  it("lays one player's week out Monday first, steps as steps, old rows as sessions", () => {
    const sheet = [
      day("a", 3, 1, { kind: "session" }),
      day("a", 3, 4, { kind: "steps" }),
      day("a", 3, 7),
      day("a", 3, 2, { isCompleted: false }),
      day("a", 4, 5),
      day("b", 3, 3),
    ];
    expect(weekDays(sheet, "a", 3)).toEqual(["session", null, null, "steps", null, null, "session"]);
  });
});
