/**
 * Does a cold start notice a database that is a migration behind?
 *
 * Production said yes to `schemaIsReady` while its `fines` table had no
 * `settled_amount`, so the boot skipped the ALTER and every `/api/seasons`
 * answered 500. This rebuilds that exact shape in memory and asserts the probe
 * catches it — and that a fully migrated database still passes.
 *
 *   node backend/scripts/checkSchema.js
 */
const assert = require("assert");
const { createClient } = require("@libsql/client");
const { DDL, MIGRATIONS, COLUMN_PROBES } = require("../schema");

/** The one question a boot asks, against any client. */
async function ready(client) {
  try {
    const seeded = await client.execute("SELECT id FROM admin_settings WHERE id = 1");
    if (!seeded.rows[0]) return false;
    for (const probe of COLUMN_PROBES) await client.execute(probe);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Every column a migration adds must be named by a probe, or the next one
  // added ships the same way this one did.
  const probed = new Set(COLUMN_PROBES.flatMap((p) => p.match(/SELECT (.+) FROM/)[1].split(", ")));
  for (const sql of MIGRATIONS) {
    const column = sql.match(/ADD COLUMN (\w+)/)[1];
    assert(probed.has(column), `no probe covers ${column}`);
  }

  const client = createClient({ url: "file::memory:" });

  // A database from before the last migrations: tables and a season row, but
  // a fines table missing everything the ALTERs would have added.
  await client.executeMultiple(`
    ${DDL.replace(/CREATE TABLE IF NOT EXISTS fines[\s\S]*?\n  \);/, `CREATE TABLE IF NOT EXISTS fines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      amount INTEGER NOT NULL
    );`)}
    INSERT INTO admin_settings (id, challenge_start_date, challenge_end_date)
      VALUES (1, '2026-09-14', '2027-03-01');
  `);

  assert.strictEqual(await ready(client), false, "a stale database passed as ready");

  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) throw err;
    }
  }

  assert.strictEqual(await ready(client), true, "a migrated database failed as stale");
  console.log(`PASS  ${COLUMN_PROBES.length} probes cover ${MIGRATIONS.length} migrations`);
}

main().catch((err) => {
  console.error("FAIL ", err.message);
  process.exit(1);
});
