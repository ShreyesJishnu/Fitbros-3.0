import { dayOfWeekNow } from "./seasonEngine";

/**
 * Today, as the season counts days: Monday is 0, Sunday is 6.
 *
 * Read from the season's own clock, not the device's. A phone in another
 * timezone would otherwise ring a day the server refuses to accept a workout
 * for, which is a worse bug than the one the ring was added to fix.
 */
export const todayIndex = (date: Date = new Date()): number => dayOfWeekNow(date) - 1;
