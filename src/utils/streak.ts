/**
 * The streak as the dashboard shows it, Snapchat-style: a flame and a count.
 *
 * The engine's cleanStreak only counts weeks that have closed. A week already
 * cleared before Sunday has earned its flame, so the running week adds one the
 * moment it is clean — the same instant the player sees it go green.
 */

export interface StreakInput {
  cleanStreak: number;
  currentWeekProgress: { credits: number; needed: number };
}

export const isWeekClean = (p: StreakInput["currentWeekProgress"]) => p.needed > 0 && p.credits >= p.needed;

export const liveStreak = (row: StreakInput): number =>
  row.cleanStreak + (isWeekClean(row.currentWeekProgress) ? 1 : 0);

/** From Friday on, the week is not won yet. Snapchat's hourglass. */
export const HOURGLASS_FROM_DAY = 4; // 0 = Monday

export const streakAtRisk = (row: StreakInput, today: number): boolean =>
  liveStreak(row) > 0 && !isWeekClean(row.currentWeekProgress) && today >= HOURGLASS_FROM_DAY;

/**
 * How deep into an unbroken clean run each week sits, keyed by week number.
 *
 * A run is the thing the rules reward — two in a row halves what a miss costs —
 * and a plain green gave four scattered weeks the same look as four in a row.
 * An excused week carries a run across without extending it: it neither breaks
 * a clean streak nor builds one.
 */
export const cleanRun = (weeks: { week: number; outcome: string }[]): Map<number, number> => {
  let run = 0;
  const out = new Map<number, number>();
  for (const w of [...weeks].sort((a, b) => a.week - b.week)) {
    if (w.outcome === "missed") run = 0;
    else if (w.outcome !== "excused") run += 1;
    out.set(w.week, w.outcome === "clean" ? run : 0);
  }
  return out;
};

/** Clean green, deeper the longer the run. Two in a row is the rule's own step. */
export const heatClass = (run: number): string =>
  run >= 3 ? "bg-clean-700" : run === 2 ? "bg-clean-600" : "bg-clean-500";

/** The flame's temperature: 0 cold, then one step at each of 1, 3, 6 and 12 weeks. */
export const flameTier = (streak: number): number =>
  streak >= 12 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : streak >= 1 ? 1 : 0;

/** A streak that just crossed into a hotter tier worth a burst — 3, 6 and 12 weeks. */
export const flameMilestone = (before: number, after: number): boolean =>
  flameTier(after) >= 2 && flameTier(after) > flameTier(before);
