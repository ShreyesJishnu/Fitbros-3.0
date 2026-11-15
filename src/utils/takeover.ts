import { WorkoutDay, WorkoutKind } from "../types";

/**
 * The full-screen figure: what a player's day looks like when they open the app
 * and every time they log. Purely a show — it reads the sheet, it decides
 * nothing.
 */
export type TakeoverKind = WorkoutKind | "none";

export interface TakeoverShow {
  kind: TakeoverKind;
  /** Set when the day logged is not today, so the screen says which day. */
  day?: string;
  /** Changes on every play, so logging the same kind twice still replays. */
  id: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** What this player has logged for one day: a session, a walk, or nothing. */
export const kindOn = (
  workoutDays: WorkoutDay[],
  userId: string,
  week: number,
  dayOfWeek: number
): TakeoverKind => {
  const row = workoutDays.find(
    (w) => w.userId === userId && w.week === week && w.dayOfWeek === dayOfWeek && w.isCompleted
  );
  return row ? row.kind ?? "session" : "none";
};

/**
 * Whether a tap gets the takeover, and with what.
 *
 * Only the running week, and never a day still ahead: a figure flexing over a
 * workout booked for Saturday would be the app claiming training that has not
 * happened. Earlier weeks are corrections, not moments.
 */
export const takeoverForTap = (opts: {
  live: boolean;
  dayOfWeek: number;
  /** Today as the season counts it, Monday = 0. */
  today: number;
  next: WorkoutKind | null;
}): Omit<TakeoverShow, "id"> | null => {
  const { live, dayOfWeek, today, next } = opts;
  if (!live || dayOfWeek > today + 1) return null;
  return { kind: next ?? "none", day: dayOfWeek === today + 1 ? undefined : DAYS[dayOfWeek - 1] };
};
