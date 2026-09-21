
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

/** A clean week is 4 workouts' worth of credit. Flat for everyone, every week. */
const WORKOUTS_PER_WEEK = 4;

/**
 * What a logged day is worth.
 *
 * A session is a workout. 10k steps is half of one, so two step days make a
 * workout — and since a day can only be logged once, seven step days come to
 * 3.5 and no week can be walked clean.
 *
 * That last line is what puts a floor under WORKOUTS_PER_WEEK: at 4 a full week
 * of walking is still half a workout short, at 3 it would clear the bar. The
 * threshold cannot go below 4 without walking becoming enough on its own.
 */
const CREDIT_BY_KIND = { session: 1, steps: 0.5 };
const DEFAULT_KIND = 'session';

/** The season is 24 weeks long. Nothing can be logged outside it. */
const SEASON_WEEKS = 24;

/**
 * How far back a player may correct their own sheet, in closed weeks.
 *
 * The group decided people forget to log and should be able to put it right.
 * The cost is stated rather than hidden: a week that stops being a miss stops
 * being billed, so somebody carrying an unpaid fine can log four days into that
 * week and the fine voids itself. Money already paid is safe — what was paid is
 * recorded, not recomputed — but a debt still owed can be erased by the person
 * who owes it.
 *
 * Infinity is the whole season. Set it to 1 and only the week just gone is
 * reachable, which covers forgetting to log Saturday without opening the rest.
 */
const WEEKS_EDITABLE_BACK = Infinity;

/**
 * The clock the season runs on. One zone for everyone, so a day starts and ends
 * at the same moment for the whole group however far anybody has travelled.
 */
const SEASON_TIME_ZONE = "Asia/Kolkata";

const DAY_NUMBER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/**
 * Which day of the season's week it is right now — Monday is 1.
 *
 * This is not the ban on deriving the week from a date. The week is the
 * admin's to set and is read from admin_settings; this answers only which day
 * inside that week has arrived, which is the difference between logging a
 * workout and claiming one you have not done yet.
 *
 * Intl does the zone conversion, so there is no date library and no arithmetic
 * on offsets to get wrong twice a year.
 */
/** The season's calendar date, as YYYY-MM-DD in its own zone. */
const seasonDate = (now = new Date(), timeZone = SEASON_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

/**
 * Which week the calendar is in — for the scheduler, and nothing else.
 *
 * This is NOT the season's current week. That is stored in admin_settings and
 * read from there by every screen and every fine, because a week derived
 * independently by each reader is the bug that has been fixed twice. This
 * answers a different question, asked by one caller: has the stored week
 * fallen behind the calendar, so the job that closes weeks should run?
 *
 * Whole weeks since the start date, so the first seven days are week 1. Both
 * dates are reduced to a calendar day in the season's zone first, which is why
 * an hour's difference either side of midnight cannot move the answer.
 */
function seasonWeekOn(startDate, now = new Date(), timeZone = SEASON_TIME_ZONE) {
  if (!startDate) return 1;
  const day = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const days = Math.round((day(seasonDate(now, timeZone)) - day(startDate)) / 86400000);
  if (!Number.isFinite(days)) return 1;
  return Math.min(SEASON_WEEKS, Math.max(1, Math.floor(days / 7) + 1));
}

function dayOfWeekNow(now = new Date(), timeZone = SEASON_TIME_ZONE) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return DAY_NUMBER[weekday];
}

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
  WEEKS_EDITABLE_BACK,
  SEASON_TIME_ZONE,
  dayOfWeekNow,
  seasonWeekOn,
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
