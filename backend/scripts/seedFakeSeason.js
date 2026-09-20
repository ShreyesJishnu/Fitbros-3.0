/**
 * Seed a fake season covering every state the rules can produce.
 *
 * Nine players, each parked in a different corner of the money rules, plus a
 * different legal (and one deliberately incomplete) goal split each. Fines are
 * derived by the same engine the API uses, so the seeded data can never
 * disagree with what the app would charge.
 *
 * Wipes the tables it seeds. Local development only.
 */
// Fixtures belong nowhere near the season people are paying into. Turso means
// production, so this refuses unless someone deliberately types SEED_FORCE=1.
if (process.env.TURSO_DATABASE_URL && process.env.SEED_FORCE !== "1") {
  console.error(
    "Refusing to seed fake players into a Turso database. " +
      "Unset TURSO_DATABASE_URL for local work, or set SEED_FORCE=1 if you truly mean it."
  );
  process.exit(1);
}

const db = require("../db");
const { DDL, INDEXES, MIGRATIONS } = require("../schema");
const engine = require("../../src/utils/seasonEngine");
const { v4: uuidv4 } = require("uuid");

/** Hours before a fine reads as overdue. Mirrors backend/server.js. */
const { PAYMENT_GRACE_HOURS } = engine;

const WEEKS_PLAYED = 10;
const CLEAN = 5; // a clean week
const MISS = 2; // short of a clean week, whatever the threshold is
/** [sessions, stepDays] — 3 sessions and 4 walks is 3 + 2 = 5 credits, still clean. */
const WALKED = [3, 4];

/**
 * weeks   — workouts logged per week
 * pays    — "all" settles every fine, "none" settles nothing,
 *           or an array of the weeks whose fines get settled
 * goals   — [description, category, completed?, baseline, target, unit]
 */
const PLAYERS = [
  {
    id: "priya",
    name: "Priya",
    avatar: "🏃‍♀️",
    note: "perfect season",
    weeks: Array(10).fill(CLEAN),
    pays: "all",
    goals: [
      ["Deadlift 100kg", "strength", true, 70, 100, "kg"],
      ["Half marathon under 2h", "endurance", false, 150, 120, "min"],
    ],
  },
  {
    id: "rahul",
    name: "Rahul",
    avatar: "🏋️",
    note: "one unpaid fine, from the week that just closed",
    weeks: [...Array(9).fill(CLEAN), MISS],
    pays: "none",
    goals: [
      ["Bench 80kg for 5", "strength", false, 60, 80, "kg"],
      ["Swim 1km non-stop", "cardio", false, 300, 1000, "m"],
      ["Play squash 15 times", "sports", false, 0, 15, "games"],
    ],
  },
  {
    id: "sana",
    name: "Sana",
    avatar: "🚴‍♀️",
    note: "one miss, never paid — owes it and sits out of the pot",
    weeks: [CLEAN, CLEAN, MISS, ...Array(7).fill(CLEAN)],
    pays: "none",
    goals: [
      ["Run 5k every week", "cardio", true, 0, 10, "runs"],
      ["20 pull-ups in a set", "strength", true, 8, 20, "reps"],
      ["Cycle 200km total", "endurance", false, 0, 200, "km"],
      ["Yoga 30 sessions", "mobility", false, 0, 30, "sessions"],
      ["Plank 3 minutes", "core", false, 60, 180, "sec"],
      ["Climb 20 routes", "sports", false, 0, 20, "routes"],
    ],
  },
  {
    id: "vikram",
    name: "Vikram",
    avatar: "🥊",
    note: "three misses, all paid — price doubled to ₹400",
    weeks: [...Array(7).fill(CLEAN), MISS, MISS, MISS],
    pays: "all",
    goals: [
      ["Squat 10 reps at 75kg", "strength", true, 4, 10, "reps"],
      ["Sub-25 minute 5k", "cardio", true, 31, 25, "min"],
      ["Box 12 sessions", "sports", true, 0, 12, "sessions"],
    ],
  },
  {
    id: "neha",
    name: "Neha",
    avatar: "🤸‍♀️",
    note: "six misses paid — the ladder is up at ₹800",
    weeks: [MISS, MISS, MISS, MISS, MISS, MISS, CLEAN, CLEAN, MISS, CLEAN],
    pays: "all",
    goals: [
      ["Muscle-up unassisted", "strength", false, 0, 1, "reps"],
      ["Walk 10k steps daily", "consistency", false, 0, 90, "days"],
      ["Stretch 60 sessions", "mobility", false, 0, 60, "sessions"],
      ["Badminton 20 games", "sports", false, 0, 20, "games"],
    ],
  },
  {
    id: "imran",
    name: "Imran",
    avatar: "⛹️",
    note: "climbed, then clean weeks halved the price back to ₹200",
    weeks: [MISS, MISS, MISS, CLEAN, CLEAN, WALKED, CLEAN, WALKED, CLEAN, CLEAN],
    pays: "all",
    goals: [
      ["Row 2km under 8 minutes", "cardio", true, 9.5, 8, "min"],
      ["Overhead press 50kg", "strength", false, 35, 50, "kg"],
      ["Football 25 games", "sports", false, 0, 25, "games"],
      ["Row 5km under 20 minutes", "consistency", false, 24, 20, "min"],
    ],
  },
  {
    id: "dev",
    name: "Dev",
    avatar: "🚶",
    note: "three misses, none of them paid",
    weeks: [MISS, CLEAN, MISS, MISS, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN],
    pays: "none",
    goals: [
      ["Cycle to work 40 times", "consistency", false, 0, 40, "rides"],
      ["Hike 5 trails", "endurance", false, 0, 5, "trails"],
      ["Push-ups 100 in a day", "strength", false, 30, 100, "reps"],
      ["Table tennis 15 games", "sports", false, 0, 15, "games"],
      ["Cold plunge 20 times", "recovery", false, 0, 20, "plunges"],
    ],
  },
  {
    id: "anya",
    name: "Anya",
    avatar: "🧗‍♀️",
    note: "three scattered misses, all paid",
    weeks: [CLEAN, MISS, MISS, CLEAN, CLEAN, MISS, CLEAN, CLEAN, CLEAN, CLEAN],
    pays: "all",
    goals: [
      ["Lead climb 6b", "sports", false, 0, 6, "grade"],
      ["Hangboard 3x a week", "strength", false, 0, 36, "sessions"],
    ],
  },
  {
    id: "kabir",
    name: "Kabir",
    avatar: "🏊",
    note: "one fine paid, two still due — and two walked weeks",
    weeks: [CLEAN, MISS, WALKED, MISS, CLEAN, WALKED, CLEAN, CLEAN, CLEAN, MISS],
    pays: [4],
    goals: [
      ["Swim 100 lengths", "endurance", false, 20, 100, "lengths"],
      ["Bench 70kg for 5", "strength", false, 45, 70, "kg"],
    ],
  },
];

const workoutRowsFor = (player) => {
  const rows = [];
  player.weeks.forEach((entry, i) => {
    const [sessions, steps] = Array.isArray(entry) ? entry : [entry, 0];
    let day = 1;
    for (let d = 0; d < sessions; d++) rows.push({ week: i + 1, dayOfWeek: day++, kind: "session" });
    for (let d = 0; d < steps; d++) rows.push({ week: i + 1, dayOfWeek: day++, kind: "steps" });
  });
  return rows;
};

/**
 * The seed must not write a season the API would refuse to create.
 *
 * Every fixture goes through the same eligibility check `POST /api/goals` runs,
 * and must carry the numbers the form now demands. A fixture that fails is a
 * broken seed, not a warning.
 */
function checkGoalFixtures() {
  const bad = [];
  for (const player of PLAYERS) {
    for (const [description, , , baseline, target, unit] of player.goals) {
      const reason = engine.goalEligibilityError(description, target != null ? String(target) : "");
      if (reason) bad.push(`${player.name}: "${description}" — ${reason}`);
      else if (baseline == null || target == null || !unit) {
        bad.push(`${player.name}: "${description}" — needs a baseline, a target and a unit`);
      }
    }
  }
  if (bad.length) {
    throw new Error(`Seed fixtures the API would reject:\n  ${bad.join("\n  ")}`);
  }
}

async function seed() {
  checkGoalFixtures();
  await db.execMultiple(DDL);
  for (const sql of MIGRATIONS) {
    try {
      await db.exec(sql);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) throw err;
    }
  }
  await db.execMultiple(INDEXES);

  for (const table of ["goal_progress", "fines", "workout_days", "goals", "users"]) {
    await db.run(`DELETE FROM ${table}`);
  }
  await db.run("DELETE FROM admin_settings");

  await db.run(
    `INSERT INTO admin_settings (id, challenge_start_date, challenge_end_date, current_week, is_active)
     VALUES (1, ?, ?, ?, 1)`,
    ["2026-01-19", "2026-07-31", WEEKS_PLAYED + 1]
  );

  const summary = [];
  const progressRows = [];

  for (const player of PLAYERS) {
    await db.run(
      `INSERT INTO users (id, name, avatar, start_date, price_level, secret)
       VALUES (?, ?, ?, ?, 1, ?)`,
      // A seeded player needs the secret half of a link like a real one, or
      // every local check runs against rows the guard cannot hold to anything.
      [player.id, player.name, player.avatar, "2026-01-19", `seed-${player.id}`]
    );

    const workouts = workoutRowsFor(player);
    for (const row of workouts) {
      await db.run(
        `INSERT INTO workout_days (id, user_id, week, day_of_week, date, is_completed, kind, workout_type, marked_by, timestamp)
         VALUES (?, ?, ?, ?, ?, 1, ?, 'gym', 'user', ?)`,
        [
          uuidv4(),
          player.id,
          row.week,
          row.dayOfWeek,
          `2026-W${row.week}-${row.dayOfWeek}`,
          row.kind,
          new Date().toISOString(),
        ]
      );
    }

    // Ask the engine what this season costs, then record those fines. Using the
    // same engine as the API means the seed can't invent a fine the rules wouldn't.
    const settledWeeks =
      player.pays === "all"
        ? Array.from({ length: WEEKS_PLAYED }, (_, i) => i + 1)
        : player.pays === "none"
        ? []
        : player.pays;

    const state = engine.runSeason({
      userId: player.id,
      workoutDays: workouts.map((r) => ({ ...r, userId: player.id, isCompleted: true })),
      settledWeeks,
      completedWeeks: WEEKS_PLAYED,
    });

    for (const week of state.weeks) {
      if (week.fine <= 0) continue;
      const issued = new Date("2026-01-19");
      issued.setDate(issued.getDate() + week.week * 7);
      const due = new Date(issued.getTime() + PAYMENT_GRACE_HOURS * 60 * 60 * 1000);
      const settled = settledWeeks.includes(week.week) ? due.toISOString() : null;

      await db.run(
        `INSERT INTO fines (id, user_id, week, amount, price_level, issued_at, due_at, settled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), player.id, week.week, week.fine, week.priceLevel, issued.toISOString(), due.toISOString(), settled]
      );
    }

    await db.run(
      "UPDATE users SET price_level = ?, clean_weeks = ?, missed_weeks = ? WHERE id = ?",
      [state.priceLevel, state.cleanWeeks, state.missedWeeks, player.id]
    );

    for (const goal of player.goals) {
      const [description, category, completed, baselineValue, targetValue, unit] = goal;
      const goalId = uuidv4();
      await db.run(
        `INSERT INTO goals (id, user_id, category, description, baseline, target,
          baseline_value, target_value, unit, is_completed, completed_date, created_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          goalId,
          player.id,
          category,
          description,
          baselineValue != null ? `${baselineValue}${unit ? ` ${unit}` : ""}` : null,
          targetValue != null ? `${targetValue}${unit ? ` ${unit}` : ""}` : null,
          baselineValue ?? null,
          targetValue ?? null,
          unit ?? null,
          completed ? 1 : 0,
          completed ? "2026-03-01" : null,
          "2026-01-18",
        ]
      );

      // A couple of dated updates each, so the progress bars and the feed have history.
      if (baselineValue != null && targetValue != null) {
        // Vary per goal, or every player looks identically far along.
        const spread = [
          [0.2, 0.45], [0.35, 0.7], [0.1, 0.3], [0.5, 0.85], [0.15, 0.6], [0.4, 0.62],
        ][description.length % 6];
        const steps = completed ? [0.6, 1] : spread;
        steps.forEach((fraction, i) => {
          // Reps, games and lengths are counted, not measured — no half a pull-up.
          const countable = ["reps", "games", "runs", "lengths", "grade"].includes(unit);
          const raw = baselineValue + (targetValue - baselineValue) * fraction;
          const value = countable ? Math.round(raw) : Math.round(raw * 10) / 10;
          progressRows.push([
            uuidv4(),
            goalId,
            player.id,
            value,
            null,
            new Date(Date.UTC(2026, 2 + i * 2, 12 + i * 3)).toISOString(),
          ]);
        });
      }
    }

    summary.push({
      name: player.name,
      note: player.note,
      price: engine.fineAtLevel(state.priceLevel),
      billed: state.billed,
      paid: state.paid,
      outstanding: state.outstanding,
      pot: state.potEligible ? "IN" : "OUT",
      goals: `${player.goals.length}`,
    });
  }

  for (const row of progressRows) {
    await db.run(
      "INSERT INTO goal_progress (id, goal_id, user_id, value, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      row
    );
  }

  console.log(`\n✅ Seeded ${PLAYERS.length} players across ${WEEKS_PLAYED} completed weeks\n`);
  console.log(
    "name      price   billed   paid   owed   pot   goals  scenario"
  );
  for (const s of summary) {
    console.log(
      `${s.name.padEnd(9)} ₹${String(s.price).padEnd(6)} ₹${String(s.billed).padEnd(7)} ₹${String(
        s.paid
      ).padEnd(5)} ₹${String(s.outstanding).padEnd(5)} ${s.pot.padEnd(5)} ${s.goals.padEnd(
        6
      )} ${s.note}`
    );
  }
  console.log("");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
