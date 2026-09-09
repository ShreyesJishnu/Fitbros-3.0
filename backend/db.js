const path = require("path");

/**
 * Two clients, one interface.
 *
 * Against Turso we use @tursodatabase/serverless — fetch only, no native
 * bindings, and the package Turso now recommends for serverless functions. Its
 * compat build keeps the @libsql/client shape (execute/batch/executeMultiple),
 * so nothing above this file changes.
 *
 * Locally the database is a file, which the serverless client cannot open, so
 * development stays on @libsql/client. Same SQL, same dialect, same results —
 * verified against the live database before this was switched.
 */
const { createClient } = process.env.TURSO_DATABASE_URL
  ? require("@tursodatabase/serverless/compat")
  : require("@libsql/client");

const localDbPath = path.join(__dirname, "database", "fitbois.db");

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${localDbPath}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = {
  async all(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows;
  },

  async get(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows[0] || null;
  },

  async run(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return {
      changes: result.rowsAffected,
      lastID: Number(result.lastInsertRowid),
    };
  },

  async exec(sql) {
    await client.execute(sql);
  },

  async execMultiple(sql) {
    if (typeof client.executeMultiple === "function") {
      await client.executeMultiple(sql);
    } else {
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await client.execute(stmt);
      }
    }
  },
};

module.exports = db;
