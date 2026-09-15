/**
 * Today, as the season counts days: Monday is 0, Sunday is 6.
 *
 * The server does not answer this. It holds no timezone, and the engine refuses
 * to derive the week from a date — the phone reading the screen is already in
 * the right place. JavaScript starts its week on Sunday, which is the one thing
 * worth pinning a test to.
 */
export const todayIndex = (date: Date = new Date()): number => (date.getDay() + 6) % 7;
