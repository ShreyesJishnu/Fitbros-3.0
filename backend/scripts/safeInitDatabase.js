/**
 * Bring a database up to the current shape, once, before anything talks to it.
 *
 * Run this against a new deployment's database — with TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN set — so the server never has to build the schema on a cold
 * start. The shape comes from ../initDatabase.js, the same code the server
 * would run, so the two cannot drift.
 */
const db = require("../db");
const { runDatabaseInit } = require("../initDatabase");

runDatabaseInit()
  .then(async () => {
    const row = await db.get("SELECT COUNT(*) as count FROM users");
    const season = await db.get("SELECT current_week FROM admin_settings WHERE id = 1");
    console.log(`📊 Players: ${row.count} · season on week ${season?.current_week}`);
    console.log(
      process.env.TURSO_DATABASE_URL
        ? "🌍 Turso database is ready."
        : "💾 Local database is ready."
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Database initialization failed:", err);
    process.exit(1);
  });
