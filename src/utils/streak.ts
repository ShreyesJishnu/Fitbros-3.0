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
