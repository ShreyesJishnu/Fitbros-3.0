/**
 * Bringing a database up to the current shape.
 *
 * One owner, two callers: the server on a cold start, and `npm run init-db`
 * before a deployment. They ran their own copies of this once, and drifted —
 * the script was missing three tables and a column by the time anyone noticed.
 *
 * `schemaIsReady` is the cheap question a serverless boot asks. Answering it
 * costs one statement; answering it wrong costs thirty-two, every cold start.
 */
const db = require("./db");
const { DDL, INDEXES, MIGRATIONS } = require("./schema");
const engine = require("../src/utils/seasonEngine");

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
 * Are the tables there and is there a season to report?
 *
 * Both in one statement: the query throws if the table is missing, and returns
 * nothing if the season row was never written.
 */
async function schemaIsReady() {
  try {
    return Boolean(await db.get("SELECT id FROM admin_settings WHERE id = 1"));
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

  // Indexes last: some of them cover columns the ALTERs above just added.
  await runBatch(INDEXES);

  console.log("✅ Database initialization complete");
}

module.exports = { runDatabaseInit, schemaIsReady };
