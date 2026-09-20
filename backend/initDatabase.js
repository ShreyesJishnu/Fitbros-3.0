/**
 * Bringing a database up to the current shape.
 *
 * One owner, two callers: the server on a cold start, and `npm run init-db`
 * before a deployment. They ran their own copies of this once, and drifted —
 * the script was missing three tables and a column by the time anyone noticed.
 *
 * `schemaIsReady` is the question a serverless boot asks before doing the work.
 * It has to be cheap — a wrong "no" costs thirty-two statements every cold
 * start — but a wrong "yes" is worse: it leaves a live database a migration
 * behind, which is how production came to 500 on a column it never got.
 */
const crypto = require("crypto");
const db = require("./db");
const { DDL, INDEXES, MIGRATIONS, COLUMN_PROBES } = require("./schema");
const engine = require("../src/utils/seasonEngine");

/**
 * The secret half of a player link.
 *
 * 20 base32-ish characters from a CSPRNG — long enough that guessing is not a
 * route in, short enough to survive being pasted into a chat app.
 */
const newSecret = () => crypto.randomBytes(15).toString("base64url");

const SEASON_WEEKS_MS = engine.SEASON_WEEKS * 7 * 24 * 60 * 60 * 1000;

/** Run a semicolon-separated batch, one statement at a time if we must. */
async function runBatch(sql) {
  if (typeof db.execMultiple === "function") {
    await db.execMultiple(sql);
    return;
  }
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt);
  }
}

/**
 * Are the tables there, up to date, and is there a season to report?
 *
 * All three, cheaply: the first query throws if the table is missing and
 * returns nothing if the season row was never written, and each probe throws
 * if a column a migration adds is not there yet. Asking only the first one is
 * what let a live database sit a migration behind — see COLUMN_PROBES.
 */
async function schemaIsReady() {
  try {
    if (!(await db.get("SELECT id FROM admin_settings WHERE id = 1"))) return false;
    for (const probe of COLUMN_PROBES) await db.get(probe);
    return true;
  } catch {
    return false;
  }
}

async function runDatabaseInit() {
  console.log("🚀 Initializing database...");

  await runBatch(DDL);

  // CREATE TABLE IF NOT EXISTS leaves an existing table alone, so every column
  // added after a table shipped has to arrive as its own ALTER. Duplicates are
  // expected on a database that already has them.
  for (const sql of MIGRATIONS) {
    try {
      await db.exec(sql);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        console.error("Migration note:", err.message);
      }
    }
  }

  // A season needs a row to be a season: every screen reads the current week
  // from here, and nothing else creates it, so a fresh database would answer
  // "Season not configured" forever. Admin edits the dates afterwards.
  const seasonStart = new Date().toISOString().slice(0, 10);
  const seasonEnd = new Date(Date.now() + SEASON_WEEKS_MS).toISOString().slice(0, 10);
  await db.run(
    `INSERT OR IGNORE INTO admin_settings
       (id, challenge_start_date, challenge_end_date, current_week, is_active)
     VALUES (1, ?, ?, 1, 1)`,
    [seasonStart, seasonEnd]
  );

  // Every player needs the secret half of their link. Idempotent on purpose:
  // this runs whenever the column has just been added, and must never reissue a
  // secret somebody is already carrying — that would lock them out.
  const unclaimed = await db.all("SELECT id FROM users WHERE secret IS NULL OR secret = ''");
  for (const row of unclaimed) {
    await db.run("UPDATE users SET secret = ? WHERE id = ?", [newSecret(), row.id]);
  }
  if (unclaimed.length) console.log(`🔑 Issued a link secret to ${unclaimed.length} player(s)`);

  // Indexes last: some of them cover columns the ALTERs above just added.
  await runBatch(INDEXES);

  console.log("✅ Database initialization complete");
}

module.exports = { runDatabaseInit, schemaIsReady, newSecret };
