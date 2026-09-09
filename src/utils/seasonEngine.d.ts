import { WorkoutDay, WorkoutKind } from '../types';

/**
 * Types for the shared season engine (seasonEngine.js).
 *
 * The implementation is CommonJS because the Express server requires the very
 * same file — one set of rules, no drift between UI and API.
 */

/** The ladder has no ceiling: every two misses doubles the price. */
export type PriceLevel = number;
export type WeekOutcome = 'clean' | 'missed';

export interface WeekResult {
  week: number;
  outcome: WeekOutcome;
  /** Sessions at 1, step days at a half. */
  credits: number;
  /** The price level this week was judged at. */
  priceLevel: PriceLevel;
  /** Amount fined for this week, 0 when clean. */
  fine: number;
}

export interface SeasonState {
  weeks: WeekResult[];
  priceLevel: PriceLevel;
  cleanWeeks: number;
  missedWeeks: number;
  /** Clean weeks in a row right now, toward dropping a price level. */
  cleanStreak: number;
  /** Misses at the current price, toward raising it. */
  missesAtLevel: number;
  /** Total fined across the season, settled or not. */
  billed: number;
  /** Settled so far. */
  paid: number;
  /** Owed right now. */
  outstanding: number;
  /** Rule 11: nothing owed. */
  potEligible: boolean;
}

export interface SeasonInput {
  userId: string;
  workoutDays: WorkoutDay[];
  /** Weeks whose fine has been settled. */
  settledWeeks?: number[];
  /** What was actually paid for a settled week, as recorded at the time. */
  settledAmounts?: Record<number, number>;
  /** Weeks completed so far; the in-progress week is not judged. */
  completedWeeks: number;
  /** The first week this player was in the season. Earlier weeks are not theirs. */
  fromWeek?: number;
}

/** A clean week is 5 workouts' worth of credit. Flat for everyone, every week. */
export const WORKOUTS_PER_WEEK: 5;
/** What a logged day is worth: a session 1, 10k steps a half. */
export const CREDIT_BY_KIND: Record<WorkoutKind, number>;
/** The season is 24 weeks long. Nothing can be logged outside it. */
export const SEASON_WEEKS: 24;
/** The week runs Monday to Monday: 1 = Monday … 7 = Sunday. */
export const WEEK_ENDS_ON: 7;
/** A day rolls over at midnight, for everyone. */
export const DAY_ROLLS_OVER_AT: 0;
/** What the first miss costs. Every level after it doubles. */
export const FINE_BASE: 200;
/** How long a fine has to be paid. Nothing is taken away when it passes. */
export const PAYMENT_GRACE_HOURS: 48;
/** What a miss costs at a level: 200, 400, 800, 1600 … */
export function fineAtLevel(level: number): number;
/** Misses at one price before it doubles; clean weeks in a row before it halves. */
export const WEEKS_TO_MOVE: 2;

export function runSeason(input: SeasonInput): SeasonState;
export function currentFine(state: SeasonState): number;
export function unpaidFines(state: SeasonState, settledWeeks?: number[]): WeekResult[];
/** Rule 01: physical output, measured by a number, provable. Null when eligible. */
export function goalEligibilityError(description: string, target?: string): string | null;
/**
 * How far a reading sits between baseline and target, 0 to 1. 1 completes the
 * goal — nothing else does. Null when the goal has no numbers.
 */
export function goalProgressFraction(
  baseline: number | null | undefined,
  target: number | null | undefined,
  current: number | null | undefined
): number | null;
