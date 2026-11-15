import { SquadRow, squadHealth, squadPulse } from "./SquadWall";
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
