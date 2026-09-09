/**
 * The FitBros 3.0 schema, in one place.
 *
 * Both the server (on boot) and scripts/safeInitDatabase.js run this, so the
 * shape of the database can't drift between them.
 */
const DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    start_date TEXT NOT NULL,
    price_level INTEGER NOT NULL DEFAULT 1,
    clean_weeks INTEGER NOT NULL DEFAULT 0,
    missed_weeks INTEGER NOT NULL DEFAULT 0,
    standing TEXT NOT NULL DEFAULT 'active', -- vestigial: nothing derives from it
    -- vestigial: the season runs one clock (Monday to Monday, midnight rollover),
    -- stated by the engine. Kept so an existing database is untouched.
    cutoff_hour INTEGER NOT NULL DEFAULT 0,
    week_end_day INTEGER NOT NULL DEFAULT 7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 1, -- vestigial: goals are not scored; kept so existing databases are untouched
    baseline TEXT,
    target TEXT,
    baseline_value REAL,
    target_value REAL,
    unit TEXT,
    approved_at TEXT, -- vestigial: goals need no sign-off; kept so existing databases are untouched
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    completed_date TEXT,
    created_date TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS goal_progress (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    value REAL NOT NULL,
    note TEXT,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS workout_days (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    week INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    date TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'session',
    workout_type TEXT,
    notes TEXT,
    marked_by TEXT NOT NULL DEFAULT 'admin',
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, week, day_of_week)
  );
  CREATE TABLE IF NOT EXISTS fines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    week INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    price_level INTEGER NOT NULL,
    issued_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    settled_at TEXT,
    settled_amount INTEGER, -- what was actually paid, not what a replay derives
    waived_by_token_id TEXT,
    voided_at TEXT,
    voided_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, week)
  );
  CREATE TABLE IF NOT EXISTS proofs (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    timestamp TEXT NOT NULL,
    week INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY,
    challenge_start_date TEXT NOT NULL,
    challenge_end_date TEXT NOT NULL,
    current_week INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Indexes run after the column migrations, not with the tables: an index on a
 * column a pre-3.0 database has not got yet would abort the whole batch.
 */
const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_workout_user ON workout_days (user_id);
  CREATE INDEX IF NOT EXISTS idx_workout_user_week ON workout_days (user_id, week);
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id);
  CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress (goal_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_fines_user ON fines (user_id);
  CREATE INDEX IF NOT EXISTS idx_fines_unsettled ON fines (user_id, settled_at);
`;

/**
 * Columns a database created before this version will not have.
 *
 * CREATE TABLE IF NOT EXISTS leaves an existing table alone, so every column
 * added after a table shipped has to arrive as its own ALTER. Duplicates are
 * expected and ignored by the callers — the server on boot, and the seed script.
 */
const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN price_level INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN standing TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE users ADD COLUMN cutoff_hour INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN week_end_day INTEGER NOT NULL DEFAULT 7",
  "ALTER TABLE goals ADD COLUMN points INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE goals ADD COLUMN approved_at TEXT",
  "ALTER TABLE fines ADD COLUMN price_level INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE fines ADD COLUMN issued_at TEXT",
  "ALTER TABLE fines ADD COLUMN due_at TEXT",
  "ALTER TABLE fines ADD COLUMN settled_at TEXT",
  "ALTER TABLE fines ADD COLUMN settled_amount INTEGER",
  "ALTER TABLE fines ADD COLUMN waived_by_token_id TEXT",
  "ALTER TABLE workout_days ADD COLUMN kind TEXT NOT NULL DEFAULT 'session'",
  "ALTER TABLE goals ADD COLUMN baseline_value REAL",
  "ALTER TABLE goals ADD COLUMN target_value REAL",
  "ALTER TABLE goals ADD COLUMN unit TEXT",
  "ALTER TABLE fines ADD COLUMN voided_at TEXT",
  "ALTER TABLE fines ADD COLUMN voided_reason TEXT",
];

module.exports = { DDL, INDEXES, MIGRATIONS };
