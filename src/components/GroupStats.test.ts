import { Goal } from "../types";
import { StatsRow, goalFraction, weeklyColumns } from "./GroupStats";

/**
 * The one thing worth pinning: a goal with no numbers is unmeasurable (null),
 * not zero. Averaging it in as zero is what made Dev read 0% and Imran 43%.
 */
const goal = (over: Partial<Goal>): Goal =>
  ({
    id: "g",
    userId: "u",
    category: "strength",
    description: "Bench 80kg for 5",
    baseline: "",
    target: "",
    isCompleted: false,
    proofs: [],
    createdDate: "2026-01-01",
    ...over,
  }) as Goal;

test("a goal with no numbers cannot be measured", () => {
  expect(goalFraction(goal({}))).toBeNull();
  expect(goalFraction(goal({ baselineValue: 60 }))).toBeNull();
});

test("numbers but no reading yet is a real zero, not unmeasurable", () => {
  expect(goalFraction(goal({ baselineValue: 60, targetValue: 80 }))).toBe(0);
});

test("progress is clamped between the baseline and the target", () => {
  const g = goal({ baselineValue: 60, targetValue: 80 });
  expect(goalFraction(g, 70)).toBe(0.5);
  expect(goalFraction(g, 50)).toBe(0);
  expect(goalFraction(g, 90)).toBe(1);
});

test("a ticked goal counts as done even without numbers", () => {
  expect(goalFraction(goal({ isCompleted: true }))).toBe(1);
});

/**
 * The chart used to index each player's weeks by position, so a mid-season
 * joiner's week 6 was counted in the week 1 column.
 */
const player = (name: string, from: number, outcomes: ("clean" | "missed")[]): StatsRow => ({
  userId: name,
  name,
  cleanWeeks: outcomes.filter((o) => o === "clean").length,
  cleanStreak: 0,
  paid: 0,
  outstanding: 0,
  weeks: outcomes.map((outcome, i) => ({
    week: from + i,
    outcome,
    credits: outcome === "clean" ? 5 : 0,
    fine: outcome === "clean" ? 0 : 200,
  })),
});

test("a mid-season joiner is counted in the week they actually played", () => {
  const cols = weeklyColumns([
    player("early", 1, ["clean", "missed", "clean", "clean", "clean", "missed"]),
    player("joined-in-6", 6, ["clean"]),
  ]);

  expect(cols.map((c) => c.week)).toEqual([1, 2, 3, 4, 5, 6]);
  // Week 1 is the early player alone; week 6 has both, one each way.
  expect(cols[0]).toMatchObject({ clean: 1, missed: 0, players: 1 });
  expect(cols[5]).toMatchObject({ week: 6, clean: 1, missed: 1, players: 2 });
  // The bill runs across weeks, not across array positions.
  expect(cols[5].running).toBe(400);
});
