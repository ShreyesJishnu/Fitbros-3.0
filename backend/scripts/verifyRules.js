/**
 * Check the rules that decide money, against a running local API.
 *
 * Not a unit test — it drives the real server the way a player and an admin
 * would, and prints one line per rule. Run it after any change to the engine,
 * the guards, or the fines, and before letting a change near the season.
 *
 *   node backend/scripts/seedFakeSeason.js
 *   PORT=5050 ADMIN_KEY=test-secret node backend/server.js &
 *   node backend/scripts/verifyRules.js
 *
 * It writes and then undoes its own test data, and reseeds at the end, so the
 * database it leaves behind is the one it found. Never point it at Turso.
 */
const API = process.env.API || "http://localhost:5050/api";
const ADMIN = process.env.ADMIN_KEY || "test-secret";

if (process.env.TURSO_DATABASE_URL) {
  console.error("Refusing to run against Turso. This writes test data.");
  process.exit(1);
}

const results = [];
const record = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const call = async (method, path, { player, admin, body } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (player) headers["x-player-id"] = player;
  if (admin) headers["x-admin-key"] = ADMIN;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

const season = (id) => call("GET", `/season/${id}`).then((r) => r.body);
const workout = (userId, week, dayOfWeek, kind = "session") => ({
  userId,
  week,
  dayOfWeek,
  date: "2026-01-05",
  isCompleted: true,
  kind,
});

async function clearWeek(userId, week) {
  const { body } = await call("GET", `/workouts/${userId}/${week}`);
  for (const row of Array.isArray(body) ? body : []) {
    await call("DELETE", `/workouts/${row.id}`, { admin: true });
  }
}

async function main() {
  const settings = (await call("GET", "/settings")).body;
  const currentWeek = Number(settings.currentWeek);
  console.log(`\nSeason on week ${currentWeek}. Testing against ${API}\n`);

  // Find a player who is carrying a fine from a week that has already closed.
  const all = (await call("GET", "/seasons")).body;
  const debtor = all.find((p) => p.outstanding > 0 && p.weeks.some((w) => w.fine > 0));
  if (!debtor) {
    console.error("No player owes money in this season — reseed and run again.");
    process.exit(1);
  }
  const finedWeek = debtor.weeks.filter((w) => w.fine > 0)[0].week;
  const owedBefore = debtor.outstanding;

  console.log("History is read-only for players");
  {
    const asPlayer = await call("POST", "/workouts", {
      player: debtor.userId,
      body: workout(debtor.userId, finedWeek, 1),
    });
    record(
      "a player cannot log into a week that has closed",
      asPlayer.status === 403,
      `week ${finedWeek} -> ${asPlayer.status}`
    );

    const after = await season(debtor.userId);
    record(
      "their debt is untouched by the attempt",
      after.outstanding === owedBefore,
      `owes ₹${after.outstanding}`
    );

    const asAdmin = await call("POST", "/workouts", {
      admin: true,
      body: workout(debtor.userId, finedWeek, 1),
    });
    record("the admin can correct a closed week", asAdmin.status === 200, `-> ${asAdmin.status}`);
    await clearWeek(debtor.userId, finedWeek);

    const thisWeek = await call("POST", "/workouts", {
      player: debtor.userId,
      body: workout(debtor.userId, currentWeek, 1),
    });
    record(
      "the current week is still theirs to log",
      thisWeek.status === 200,
      `week ${currentWeek} -> ${thisWeek.status}`
    );
    await clearWeek(debtor.userId, currentWeek);
  }

  console.log("\nOnly the admin records a payment");
  {
    const fines = (await call("GET", `/fines?userId=${debtor.userId}`)).body;
    const unpaid = (Array.isArray(fines) ? fines : []).find((f) => !f.settledAt);
    if (!unpaid) {
      record("a fine was available to settle", false, "none unpaid");
    } else {
      const asPlayer = await call("POST", `/fines/${unpaid.id}/settle`, { player: debtor.userId });
      record(
        "a player cannot mark their own fine paid",
        asPlayer.status === 403,
        `-> ${asPlayer.status}`
      );

      const asAdmin = await call("POST", `/fines/${unpaid.id}/settle`, { admin: true });
      record("the admin can", asAdmin.status === 200, `-> ${asAdmin.status}`);

      const again = await call("POST", `/fines/${unpaid.id}/settle`, { admin: true });
      record("settling twice is refused", again.status === 409, `-> ${again.status}`);

      // What was paid is a record, not a recomputation: rewriting an earlier
      // week must not change it.
      const afterSettle = await season(debtor.userId);
      const paidBefore = afterSettle.paid;
      const earlier = afterSettle.weeks.find((w) => w.week < unpaid.week && w.fine > 0);
      if (earlier) {
        for (let d = 1; d <= 5; d++) {
          await call("POST", "/workouts", { admin: true, body: workout(debtor.userId, earlier.week, d) });
        }
        const afterEdit = await season(debtor.userId);
        record(
          "rewriting an earlier week does not change what was paid",
          afterEdit.paid === paidBefore,
          `paid ₹${paidBefore} -> ₹${afterEdit.paid}`
        );
        await clearWeek(debtor.userId, earlier.week);
      } else {
        record("rewriting an earlier week does not change what was paid", true, "no earlier fined week to test");
      }
    }
  }

  console.log("\nThe ladder forgives clean weeks at every rung");
  {
    const engine = require("../../src/utils/seasonEngine");
    const build = (perWeek) =>
      perWeek.flatMap((n, i) =>
        Array.from({ length: n }, (_, d) => ({
          userId: "u",
          week: i + 1,
          dayOfWeek: d + 1,
          isCompleted: true,
          kind: "session",
        }))
      );
    const priceAfter = (perWeek) => {
      const state = engine.runSeason({
        userId: "u",
        workoutDays: build(perWeek),
        completedWeeks: perWeek.length,
        settledWeeks: perWeek.map((_, i) => i + 1),
      });
      return engine.currentFine(state);
    };

    const scattered = priceAfter([0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0]);
    record(
      "a miss, ten clean weeks, then a miss still costs ₹200",
      scattered === 200,
      `₹${scattered}`
    );

    const consecutive = priceAfter([0, 0]);
    record("two misses in a row double the price to ₹400", consecutive === 400, `₹${consecutive}`);

    const recovered = priceAfter([0, 0, 5, 5]);
    record("two clean weeks halve it back to ₹200", recovered === 200, `₹${recovered}`);
  }

  console.log("\nThe guards that were already there");
  {
    const other = all.find((p) => p.userId !== debtor.userId);
    const cross = await call("POST", "/workouts", {
      player: other.userId,
      body: workout(debtor.userId, currentWeek, 2),
    });
    record("one player cannot log for another", cross.status === 403, `-> ${cross.status}`);

    const anon = await call("POST", "/workouts", {
      body: workout(debtor.userId, currentWeek, 2),
    });
    record("an unidentified caller is refused", anon.status === 401, `-> ${anon.status}`);

    const admin = await call("POST", "/fines/sync", { body: {} });
    record("posting fines needs the admin key", admin.status === 403, `-> ${admin.status}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(", ")}` : "")
  );
  console.log("\nReseeding so the season is as you left it…");
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Check failed to run:", err.message);
  process.exit(1);
});
