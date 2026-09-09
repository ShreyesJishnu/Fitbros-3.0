
/**
 * FitBros 3.0 season engine.
 *
 * One rule owner for the whole season. Every derived fact — the price of a miss,
 * the fines, the pot — is replayed from the raw record of what a player did, so
 * there is no stored state to drift.
 *
 * Replaces consistencyCalculator.ts, which models the FitBois 2.0 rules
 * (a workload ladder scored on points). Both exist until the screens migrate.
 *
 * Plain CommonJS on purpose: the Express server requires this same file, so the
 * rules can never drift between what the app shows and what the API charges.
 * Types are in seasonEngine.d.ts.
 */

/** A clean week is 5 workouts' worth of credit. Flat for everyone, every week. */
const WORKOUTS_PER_WEEK = 5;

/**
 * What a logged day is worth.
 *
 * A session is a workout. 10k steps is half of one, so two step days make a
 * workout — and since a day can only be logged once, seven step days come to
 * 3.5 and no week can be walked clean.
 */
const CREDIT_BY_KIND = { session: 1, steps: 0.5 };
const DEFAULT_KIND = 'session';

/** The season is 24 weeks long. Nothing can be logged outside it. */
const SEASON_WEEKS = 24;

/**
 * One clock for everyone: the week runs Monday to Monday, and a day rolls over
 * at midnight.
 *
 * These used to be per-player settings locked at Week 0. Nobody ever set them,
 * nothing enforced the cutoff, and a season where two people disagree about
 * when Sunday ends is a season with two sets of books.
 */
const WEEK_ENDS_ON = 7; // 1 = Monday … 7 = Sunday
const DAY_ROLLS_OVER_AT = 0; // midnight, on a 24-hour clock

/** What the first miss costs. Every level after it doubles. */
const FINE_BASE = 200;

/**
 * How long a fine has to be paid.
 *
 * Nothing is taken away when it passes — missing and owing no longer end a
 * season — but the fine still has a date on it, and that date is a rule, so it
 * lives here rather than in whichever file happens to write the row.
 */
const PAYMENT_GRACE_HOURS = 48;

/** Misses at one price before it doubles; clean weeks in a row before it halves. */
const WEEKS_TO_MOVE = 2;

/** What a miss costs at a given level: 200, 400, 800, 1600 … */
const fineAtLevel = (level) => FINE_BASE * 2 ** (Math.max(1, level) - 1);

/** A week's credit: sessions at 1, step days at a half. */
const creditsIn = (userId, workoutDays, week) =>
  workoutDays
    .filter((w) => w.userId === userId && w.week === week && w.isCompleted)
    .reduce((sum, w) => sum + (CREDIT_BY_KIND[w.kind] ?? CREDIT_BY_KIND[DEFAULT_KIND]), 0);

/**
 * Replay the season and derive everything from it.
 *
 * Every completed week is judged, always. Owing money changes what you are owed
 * and whether you take a share of the pot — it never stops the season for you.
 */
const runSeason = ({
  userId,
  workoutDays,
  settledWeeks = [],
  settledAmounts = {},
  completedWeeks,
  fromWeek = 1,
}) => {
  let priceLevel = 1;
  let cleanStreak = 0;
  let missesAtLevel = 0;
  let cleanWeeks = 0;
  let missedWeeks = 0;
  let billed = 0;
  let paid = 0;
  let outstanding = 0;

  const weeks = [];

  // A player is judged from the week they joined. Nobody is fined for the weeks
  // the season ran before they were in it.
  for (let week = Math.max(1, fromWeek); week <= completedWeeks; week++) {
    const credits = creditsIn(userId, workoutDays, week);

    if (credits >= WORKOUTS_PER_WEEK) {
      cleanWeeks++;
      cleanStreak++;
      weeks.push({ week, outcome: 'clean', credits, priceLevel, fine: 0 });
      // Every WEEKS_TO_MOVE clean weeks in a row wipes the strikes standing
      // against you, and drops the price a rung if you are above the bottom
      // one. Forgiveness has to work at level 1 too, or a player who strings
      // ten clean weeks between two misses is punished for the streak.
      if (cleanStreak % WEEKS_TO_MOVE === 0) {
        missesAtLevel = 0;
        if (priceLevel > 1) priceLevel = priceLevel - 1;
      }
    } else {
      const fine = fineAtLevel(priceLevel);
      missedWeeks++;
      billed += fine;
      // A fine is settled week by week. Paying the newest one does not clear the
      // ones behind it — the balance is the sum of what is still unpaid, not a
      // running total that any single payment wipes.
      // What was actually paid is what was recorded at the time. Replaying
      // history must not rewrite somebody's receipt — the derived fine is only
      // the fallback for rows written before the amount was stored.
      if (settledWeeks.includes(week)) paid += settledAmounts[week] ?? fine;
      else outstanding += fine;
      weeks.push({ week, outcome: 'missed', credits, priceLevel, fine });

      cleanStreak = 0;
      missesAtLevel++;
      if (missesAtLevel === WEEKS_TO_MOVE) {
        priceLevel = priceLevel + 1;
        missesAtLevel = 0;
      }
    }
  }

  return {
    weeks,
    priceLevel,
    cleanWeeks,
    missedWeeks,
    cleanStreak,
    missesAtLevel,
    billed,
    paid,
    outstanding,
    potEligible: outstanding === 0,
  };
};

/** What a miss costs this player right now. */
const currentFine = (state) => fineAtLevel(state.priceLevel);

/**
 * Fines the app should be telling this player about: unsettled, newest first.
 * The app posts these — nobody has to notice a missed week by hand.
 */
const unpaidFines = (state, settledWeeks = []) =>
  state.weeks
    .filter((w) => w.fine > 0 && !settledWeeks.includes(w.week))
    .sort((a, b) => b.week - a.week);


/**
 * Rule 01: a goal must be physical output, measured by a number, and provable.
 *
 * The group still approves every goal at Week 0 — this only catches the three
 * things the rules say outright, so nobody has to argue them one at a time.
 * Returns null when the goal is eligible.
 */
const INTAKE_WORDS = [
  "eat", "eating", "diet", "calorie", "calories", "macro", "macros", "protein shake",
  "sleep", "sleeping", "hydrate", "hydration", "water intake", "supplement", "fast",
  "fasting", "meal", "meals", "sugar", "alcohol", "smoking", "quit",
];
const BODYWEIGHT_WORDS = [
  "bodyweight", "body weight", "lose weight", "weight loss", "body fat", "bodyfat",
  "bmi", "waist", "slim down", "lean down", "cut to",
];
// "Lose 5kg" and friends name a weight, not a training output.
const BODYWEIGHT_PATTERNS = [
  /\b(lose|drop|shed|cut)\s+\d+\s*(kg|kgs|kilo|kilos|lb|lbs|pounds|%)/,
  /\bweigh\s+\d+/,
  /\bget\s+(down\s+)?to\s+\d+\s*(kg|kgs|lb|lbs|pounds)/,
];

const goalEligibilityError = (description, target) => {
  const text = String(description || "").toLowerCase().trim();
  if (!text) return "Say what the goal is";

  // Bodyweight is a state, not an output, and it's personal rather than group business.
  const bodyweight =
    BODYWEIGHT_WORDS.find((w) => text.includes(w)) ||
    BODYWEIGHT_PATTERNS.find((re) => re.test(text));
  if (bodyweight) {
    return "Bodyweight isn't a goal — it's a state, not an output. Set the training that gets you there.";
  }

  // Training, not intake.
  const intake = INTAKE_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (intake) {
    return `"${intake}" is something you consume, not something you do. Goals are training.`;
  }

  // Measured by a number: the target carries it, or the description does.
  const hasNumber = /\d/.test(String(target || "")) || /\d/.test(text);
  if (!hasNumber) {
    return "Give it a number — reps, kg, minutes, sessions, distance or time.";
  }

  return null;
};

/**
 * How far a reading sits between where the goal started and what counts as done.
 *
 * 1 means done. Rule 11 gives the challenge title to the most goals completed at
 * target, so this is the only thing that may complete a measured goal — a tap
 * cannot. A target below the baseline means lower is better: a 5k time, not a
 * lift. Returns null when the goal has no numbers to measure against.
 */
const goalProgressFraction = (baseline, target, current) => {
  if (baseline == null || target == null || current == null) return null;
  if (target === baseline) return current >= target ? 1 : 0;
  const fraction = (current - baseline) / (target - baseline);
  return Math.max(0, Math.min(1, fraction));
};

module.exports = {
  goalProgressFraction,
  WORKOUTS_PER_WEEK,
  CREDIT_BY_KIND,
  SEASON_WEEKS,
  WEEK_ENDS_ON,
  DAY_ROLLS_OVER_AT,
  FINE_BASE,
  PAYMENT_GRACE_HOURS,
  fineAtLevel,
  WEEKS_TO_MOVE,
  runSeason,
  currentFine,
  unpaidFines,
  goalEligibilityError,
};
