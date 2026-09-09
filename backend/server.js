const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const engine = require("../src/utils/seasonEngine");
const { runDatabaseInit, schemaIsReady } = require("./initDatabase");

/**
 * How long a fine has before it reads as overdue. The engine used to own this;
 * it stopped being a rule input when standing was removed, so it lives here now
 * — and defers to the engine if it ever exports it again.
 */
const { PAYMENT_GRACE_HOURS } = engine;

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";

const debug = isProduction ? () => {} : console.log;

// CORS configuration
const corsOptions = {
  origin: isProduction
    ? process.env.FRONTEND_URL || true
    : // Dev also serves phones on the same wifi, so allow private-network origins.
      (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed =
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
          /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
          /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/.test(origin);
        callback(allowed ? null : new Error("Origin not allowed"), allowed);
      },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-player-id", "x-admin-key"],
};

// Middleware
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build (standalone mode only, Vercel handles this itself)
if (isProduction && !isVercel) {
  const buildPath = path.join(__dirname, "..", "build");
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    console.log("✅ Serving static files from:", buildPath);
  }
}

// ==================== DATABASE INITIALIZATION ====================

let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      if (await schemaIsReady()) return;
      await runDatabaseInit();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

app.use(async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (err) {
    console.error("Database init error:", err);
    res.status(500).json({ error: "Server initialization failed" });
  }
});

// ==================== INPUT VALIDATION HELPERS ====================

const validateString = (value, fieldName, minLength = 1, maxLength = 255) => {
  if (typeof value !== "string") {
    return `${fieldName} must be a string`;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return `${fieldName} must be at least ${minLength} character(s)`;
  }
  if (trimmed.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters`;
  }
  return null;
};

const validateNumber = (value, fieldName, min = null, max = null) => {
  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a number`;
  }
  if (min !== null && num < min) {
    return `${fieldName} must be at least ${min}`;
  }
  if (max !== null && num > max) {
    return `${fieldName} must be at most ${max}`;
  }
  return null;
};

const validateBoolean = (value, fieldName) => {
  if (typeof value !== "boolean" && value !== 0 && value !== 1) {
    return `${fieldName} must be a boolean`;
  }
  return null;
};

const validatePriceLevel = (value) => {
  const level = Number(value);
  // The ladder doubles for as long as someone keeps missing, so there is no top
  // rung to validate against — only "is this a real level".
  if (!Number.isInteger(level) || level < 1) return "Price level must be a whole number, 1 or higher";
  return null;
};

// Players name their own categories now (Rule 01), so this only checks it is usable text.
const validateGoalCategory = (value) => validateString(value, "Category", 1, 60);

const sanitizeString = (value) => {
  if (typeof value !== "string") return value;
  return value.trim().replace(/[<>]/g, "");
};

/**
 * The season's current week, from admin_settings — the same row the engine uses.
 * Date arithmetic used to answer this separately, which let the plan routes and
 * the fines disagree about what week it was.
 */
async function seasonCurrentWeek() {
  const row = await db.get("SELECT current_week FROM admin_settings WHERE id = 1");
  return row ? Number(row.current_week) : 1;
}

// ==================== OWNERSHIP ====================

/**
 * Who is making this request.
 *
 * This is an ownership check, not authentication: the client states who it is
 * and the server holds it to that. It stops one player writing to another's
 * record — the common accident in a shared app — but anyone who can call the API
 * directly can still claim to be someone else. Real auth is a separate job, and
 * this is the seam it slots into.
 */
const actorOf = (req) => req.header("x-player-id") || req.body?.actorId || null;

const isAdminRequest = (req) =>
  Boolean(process.env.ADMIN_KEY) && req.header("x-admin-key") === process.env.ADMIN_KEY;

let warnedNoAdminKey = false;

/**
 * The admin seat is one shared secret, not a login: whoever holds ADMIN_KEY can
 * add or remove players and close a week. With no key configured — local work —
 * the routes stay open, because locking the only admin out of a development
 * database helps nobody. Production sets the key.
 */
function denyUnlessAdmin(req, res) {
  if (isAdminRequest(req)) return false;
  if (!process.env.ADMIN_KEY) {
    if (!warnedNoAdminKey) {
      warnedNoAdminKey = true;
      console.warn("⚠️  ADMIN_KEY is not set — admin routes are open. Set it in production.");
    }
    return false;
  }
  res.status(403).json({ error: "Admin only. This one belongs to whoever runs the season." });
  return true;
}

/** Rejects the request unless the caller owns `ownerId` (or is an admin). */
function denyUnlessOwner(req, res, ownerId) {
  if (isAdminRequest(req)) return false;
  const actor = actorOf(req);
  if (!actor) {
    res.status(401).json({ error: "Say who you are: send an x-player-id header" });
    return true;
  }
  if (actor !== ownerId) {
    res.status(403).json({ error: "That record belongs to someone else" });
    return true;
  }
  return false;
}

/**
 * A week that has closed is history. Rewriting it re-derives that week's fine,
 * which can void a debt that was already billed — so only the admin, who has to
 * be able to correct a genuine mistake, may write into one.
 * Callers pass the current week they already read; nobody pays a second round trip.
 */
function denyUnlessWeekOpen(req, res, weekNum, currentWeek) {
  if (weekNum >= currentWeek || isAdminRequest(req)) return false;
  res.status(403).json({
    error: `Week ${weekNum} is closed — the season is on week ${currentWeek}. Only the admin can correct a closed week.`,
  });
  return true;
}

// ==================== USER ROUTES ====================

app.get("/api/users", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT
        id, name, avatar, start_date, price_level,
        clean_weeks, missed_weeks,
        created_at, updated_at
      FROM users
      ORDER BY name COLLATE NOCASE ASC
    `);

    const users = rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      startDate: row.start_date,
      priceLevel: Number(row.price_level),
      cleanWeeks: Number(row.clean_weeks),
      missedWeeks: Number(row.missed_weeks),
      // Missing never removes you from the season.
      isActive: true,
    }));

    debug(`Fetched ${users.length} users`);
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const row = await db.get(
      `SELECT
        id, name, avatar, start_date, price_level,
        clean_weeks, missed_weeks,
        created_at, updated_at
      FROM users WHERE id = ?`,
      [req.params.id]
    );

    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = {
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      startDate: row.start_date,
      priceLevel: Number(row.price_level),
      cleanWeeks: Number(row.clean_weeks),
      missedWeeks: Number(row.missed_weeks),
      // Missing never removes you from the season.
      isActive: true,
    };

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users", async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const { name, avatar, priceLevel, cleanWeeks, missedWeeks } = req.body;

  const nameError = validateString(name, "Name", 1, 100);
  if (nameError) {
    res.status(400).json({ error: nameError });
    return;
  }

  if (avatar) {
    const avatarError = validateString(avatar, "Avatar", 1, 10);
    if (avatarError) {
      res.status(400).json({ error: avatarError });
      return;
    }
  }

  if (priceLevel !== undefined) {
    const levelError = validatePriceLevel(priceLevel);
    if (levelError) {
      res.status(400).json({ error: levelError });
      return;
    }
  }

  if (cleanWeeks !== undefined) {
    const cleanWeeksError = validateNumber(cleanWeeks, "Clean weeks", 0, 52);
    if (cleanWeeksError) {
      res.status(400).json({ error: cleanWeeksError });
      return;
    }
  }

  if (missedWeeks !== undefined) {
    const missedWeeksError = validateNumber(missedWeeks, "Missed weeks", 0, 52);
    if (missedWeeksError) {
      res.status(400).json({ error: missedWeeksError });
      return;
    }
  }

  try {
    const id = uuidv4();
    // A player joins the season that exists, not a date pinned in the source.
    const season = await db.get(
      "SELECT challenge_start_date FROM admin_settings WHERE id = 1"
    );
    const startDate =
      (typeof req.body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.startDate)
        ? req.body.startDate
        : null) ||
      season?.challenge_start_date ||
      new Date().toISOString().slice(0, 10);
    const sanitizedName = sanitizeString(name);
    const sanitizedAvatar = avatar
      ? sanitizeString(avatar)
      : sanitizedName.charAt(0).toUpperCase();

    await db.run(
      `INSERT INTO users (
        id, name, avatar, start_date, price_level,
        clean_weeks, missed_weeks
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sanitizedName,
        sanitizedAvatar,
        startDate,
        priceLevel || 1,
        cleanWeeks || 0,
        missedWeeks || 0,
      ]
    );

    debug(`Created user: ${sanitizedName} (ID: ${id})`);

    const user = {
      id,
      name: sanitizedName,
      avatar: sanitizedAvatar,
      startDate,
      priceLevel: priceLevel || 1,
      cleanWeeks: cleanWeeks || 0,
      missedWeeks: missedWeeks || 0,
      isActive: true,
    };

    res.status(201).json(user);
  } catch (err) {
    console.error("Error creating user:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const {
    name,
    avatar,
    priceLevel,
    cleanWeeks,
    missedWeeks,
  } = req.body;

  const nameError = validateString(name, "Name", 1, 100);
  if (nameError) {
    res.status(400).json({ error: nameError });
    return;
  }

  if (avatar) {
    const avatarError = validateString(avatar, "Avatar", 1, 10);
    if (avatarError) {
      res.status(400).json({ error: avatarError });
      return;
    }
  }

  if (priceLevel !== undefined) {
    const levelError = validatePriceLevel(priceLevel);
    if (levelError) {
      res.status(400).json({ error: levelError });
      return;
    }
  }

  if (cleanWeeks !== undefined) {
    const cleanWeeksError = validateNumber(cleanWeeks, "Clean weeks", 0, 52);
    if (cleanWeeksError) {
      res.status(400).json({ error: cleanWeeksError });
      return;
    }
  }

  if (missedWeeks !== undefined) {
    const missedWeeksError = validateNumber(missedWeeks, "Missed weeks", 0, 52);
    if (missedWeeksError) {
      res.status(400).json({ error: missedWeeksError });
      return;
    }
  }

  try {
    // A partial update is the normal case — the client sends the fields it
    // changed. Anything absent keeps the value already stored; passing the
    // undefined straight through used to fail the whole request.
    const existing = await db.get(
      `SELECT name, avatar, start_date, price_level, clean_weeks, missed_weeks
         FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sanitizedName = sanitizeString(name);
    const sanitizedAvatar = avatar
      ? sanitizeString(avatar)
      : existing.avatar || sanitizedName.charAt(0).toUpperCase();
    const nextPriceLevel = priceLevel ?? Number(existing.price_level);
    const nextCleanWeeks = cleanWeeks ?? Number(existing.clean_weeks);
    const nextMissedWeeks = missedWeeks ?? Number(existing.missed_weeks);

    const result = await db.run(
      `UPDATE users SET
        name = ?,
        avatar = ?,
        price_level = ?,
        clean_weeks = ?,
        missed_weeks = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        sanitizedName,
        sanitizedAvatar,
        nextPriceLevel,
        nextCleanWeeks,
        nextMissedWeeks,
        req.params.id,
      ]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    debug(`Updated user: ${sanitizedName} (ID: ${req.params.id})`);

    const user = {
      id: req.params.id,
      name: sanitizedName,
      avatar: sanitizedAvatar,
      startDate: existing.start_date,
      priceLevel: nextPriceLevel,
      cleanWeeks: nextCleanWeeks,
      missedWeeks: nextMissedWeeks,
      isActive: true,
    };

    res.json(user);
  } catch (err) {
    console.error("Error updating user:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  try {
    const result = await db.run("DELETE FROM users WHERE id = ?", [
      req.params.id,
    ]);

    if (result.changes === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    debug(`Deleted user ID: ${req.params.id}`);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== WORKOUT ROUTES ====================

app.get("/api/workouts", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT wd.*, u.name as user_name
      FROM workout_days wd
      JOIN users u ON wd.user_id = u.id
      ORDER BY wd.week DESC, wd.day_of_week ASC
    `);

    const workouts = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      week: row.week,
      dayOfWeek: row.day_of_week,
      kind: row.kind || "session",
      date: row.date,
      isCompleted: Boolean(row.is_completed),
      workoutType: row.workout_type,
      notes: row.notes,
      markedBy: row.marked_by,
      timestamp: row.timestamp,
    }));

    debug(`Fetched ${workouts.length} workout records`);
    res.json(workouts);
  } catch (err) {
    console.error("Error fetching all workouts:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workouts/user/:userId", async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM workout_days
      WHERE user_id = ?
      ORDER BY week DESC, day_of_week ASC`,
      [req.params.userId]
    );

    const workouts = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      week: row.week,
      dayOfWeek: row.day_of_week,
      kind: row.kind || "session",
      date: row.date,
      isCompleted: Boolean(row.is_completed),
      workoutType: row.workout_type,
      notes: row.notes,
      markedBy: row.marked_by,
      timestamp: row.timestamp,
    }));

    debug(
      `Fetched ${workouts.length} workouts for user ${req.params.userId}`
    );
    res.json(workouts);
  } catch (err) {
    console.error("Error fetching user workouts:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ahead of /:userId/:week, or Express reads "stats" as a user id and the
// week as a uuid, and the endpoint quietly answers with an empty list.
app.get("/api/workouts/stats/:userId", async (req, res) => {
  try {
    const row = await db.get(
      `SELECT
        COUNT(*) as total_workouts,
        SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_workouts,
        COUNT(DISTINCT week) as weeks_with_data,
        MAX(week) as latest_week
      FROM workout_days
      WHERE user_id = ?`,
      [req.params.userId]
    );

    const stats = {
      totalWorkouts: row.total_workouts || 0,
      completedWorkouts: row.completed_workouts || 0,
      weeksWithData: row.weeks_with_data || 0,
      latestWeek: row.latest_week || 0,
      completionRate:
        row.total_workouts > 0
          ? Math.round((row.completed_workouts / row.total_workouts) * 100)
          : 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("Error fetching workout stats:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workouts/:userId/:week", async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM workout_days
      WHERE user_id = ? AND week = ?
      ORDER BY day_of_week`,
      [req.params.userId, req.params.week]
    );

    const workouts = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      week: row.week,
      dayOfWeek: row.day_of_week,
      kind: row.kind || "session",
      date: row.date,
      isCompleted: Boolean(row.is_completed),
      workoutType: row.workout_type,
      notes: row.notes,
      markedBy: row.marked_by,
      timestamp: row.timestamp,
    }));

    res.json(workouts);
  } catch (err) {
    console.error("Error fetching workouts:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/workouts", async (req, res) => {
  const {
    userId,
    week,
    dayOfWeek,
    date,
    isCompleted,
    kind,
    workoutType,
    notes,
    markedBy,
  } = req.body;

  if (denyUnlessOwner(req, res, userId)) return;

  if (!userId || week == null || dayOfWeek == null || !date) {
    res.status(400).json({
      error: "Missing required fields: userId, week, dayOfWeek, date",
    });
    return;
  }

  const validMarkedBy = ["user", "admin"].includes(markedBy)
    ? markedBy
    : "admin";

  // A session is a workout; 10k steps is half of one. An unrecognised kind is a
  // mistake, not a session — silently promoting it would pay full credit for a
  // walk. Absent is fine: rows written before steps existed are sessions.
  const kinds = Object.keys(engine.CREDIT_BY_KIND);
  if (kind != null && !kinds.includes(kind)) {
    res.status(400).json({ error: `kind must be one of: ${kinds.join(", ")}` });
    return;
  }
  const validKind = kind ?? "session";

  const timestamp = new Date().toISOString();

  const weekNum = Number(week);
  const dayNum = Number(dayOfWeek);

  try {
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
      res.status(400).json({ error: "dayOfWeek is 1-7, Monday to Sunday" });
      return;
    }
    if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > engine.SEASON_WEEKS) {
      res.status(400).json({ error: `Week is 1-${engine.SEASON_WEEKS}` });
      return;
    }
    // You cannot have trained in a week that has not happened.
    const currentWeek = await seasonCurrentWeek();
    if (weekNum > currentWeek) {
      res.status(400).json({
        error: `Week ${weekNum} hasn't started — the season is on week ${currentWeek}`,
      });
      return;
    }
    if (denyUnlessWeekOpen(req, res, weekNum, currentWeek)) return;

    const existingRow = await db.get(
      `SELECT id FROM workout_days WHERE user_id = ? AND week = ? AND day_of_week = ?`,
      [userId, weekNum, dayNum]
    );

    const id = existingRow?.id || uuidv4();

    await db.run(
      `INSERT OR REPLACE INTO workout_days (
        id, user_id, week, day_of_week, date, is_completed,
        kind, workout_type, notes, marked_by, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        weekNum,
        dayNum,
        date,
        isCompleted ? 1 : 0,
        validKind,
        workoutType || null,
        notes || null,
        validMarkedBy,
        timestamp,
      ]
    );

    debug(
      `Upserted workout for user ${userId}, week ${weekNum}, day ${dayNum}`
    );

    // The sheet just changed, so the fines on record may no longer match it — a
    // week that became clean must stop being billed the moment it does, not the
    // next time someone closes a week.
    await syncFines(userId).catch((err) =>
      console.error("Fine sync after workout write failed:", err.message)
    );

    const workout = {
      id,
      userId,
      week: weekNum,
      dayOfWeek: dayNum,
      date,
      isCompleted,
      kind: validKind,
      workoutType: workoutType || null,
      notes: notes || null,
      markedBy: validMarkedBy,
      timestamp,
    };

    res.json(workout);
  } catch (err) {
    console.error("Error upserting workout:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/workouts/:id", async (req, res) => {
  try {
    // Deleting a day can turn a clean week into a missed one, so it is a write
    // to that player's record and belongs to them alone.
    const row = await db.get("SELECT user_id, week FROM workout_days WHERE id = ?", [req.params.id]);
    if (!row) {
      res.status(404).json({ error: "Workout not found" });
      return;
    }
    if (denyUnlessOwner(req, res, row.user_id)) return;
    if (denyUnlessWeekOpen(req, res, Number(row.week), await seasonCurrentWeek())) return;

    const result = await db.run("DELETE FROM workout_days WHERE id = ?", [
      req.params.id,
    ]);

    if (result.changes === 0) {
      res.status(404).json({ error: "Workout not found" });
      return;
    }

    await syncFines(row.user_id).catch((err) =>
      console.error("Fine sync after workout delete failed:", err.message)
    );

    debug(`Deleted workout ID: ${req.params.id}`);
    res.json({ message: "Workout deleted successfully" });
  } catch (err) {
    console.error("Error deleting workout:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ==================== GOALS ROUTES ====================

app.get("/api/goals", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT g.*, u.name as user_name
      FROM goals g
      JOIN users u ON g.user_id = u.id
      ORDER BY g.created_date DESC
    `);

    const goals = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      category: row.category,
      description: row.description,
      baseline: row.baseline,
      target: row.target,
      baselineValue: row.baseline_value != null ? Number(row.baseline_value) : undefined,
      targetValue: row.target_value != null ? Number(row.target_value) : undefined,
      unit: row.unit,
      isCompleted: Boolean(row.is_completed),
      completedDate: row.completed_date,
      createdDate: row.created_date,
      proofs: [],
    }));

    debug(`Fetched ${goals.length} goals`);
    res.json(goals);
  } catch (err) {
    console.error("Error fetching all goals:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/goals/user/:userId", async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM goals
      WHERE user_id = ?
      ORDER BY created_date DESC`,
      [req.params.userId]
    );

    const goals = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      description: row.description,
      baseline: row.baseline,
      target: row.target,
      baselineValue: row.baseline_value != null ? Number(row.baseline_value) : undefined,
      targetValue: row.target_value != null ? Number(row.target_value) : undefined,
      unit: row.unit,
      isCompleted: Boolean(row.is_completed),
      completedDate: row.completed_date,
      createdDate: row.created_date,
      proofs: [],
    }));

    debug(
      `Fetched ${goals.length} goals for user ${req.params.userId}`
    );
    res.json(goals);
  } catch (err) {
    console.error("Error fetching user goals:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * The one shape a progress reading is reported in. Both the single-goal route
 * and the batch route map through it, so they cannot drift apart.
 */
const progressRow = (r) => ({
  id: r.id,
  value: Number(r.value),
  note: r.note,
  recordedAt: r.recorded_at,
});

// Every goal's readings in one shot, keyed by goal id. Same arrays as
// /api/goals/:id/progress, but one table read instead of one per goal — Turso
// charges a round trip each. Registered above /api/goals/:id so Express doesn't
// read "progress" as a goal id.
//
// ponytail: returns the whole table — a season of readings is a few hundred
// rows. Take a ?userId= filter if that ever stops being true.
app.get("/api/goals/progress", async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT id, goal_id, value, note, recorded_at FROM goal_progress ORDER BY recorded_at ASC, id ASC"
    );
    const byGoal = {};
    for (const r of rows) {
      const list = byGoal[r.goal_id];
      if (list) list.push(progressRow(r));
      else byGoal[r.goal_id] = [progressRow(r)];
    }
    res.json(byGoal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/goals/:id", async (req, res) => {
  try {
    const row = await db.get(`SELECT * FROM goals WHERE id = ?`, [
      req.params.id,
    ]);

    if (!row) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const goal = {
      id: row.id,
      userId: row.user_id,
      category: row.category,
      description: row.description,
      baseline: row.baseline,
      target: row.target,
      baselineValue: row.baseline_value != null ? Number(row.baseline_value) : undefined,
      targetValue: row.target_value != null ? Number(row.target_value) : undefined,
      unit: row.unit,
      isCompleted: Boolean(row.is_completed),
      completedDate: row.completed_date,
      createdDate: row.created_date,
      proofs: [],
    };

    res.json(goal);
  } catch (err) {
    console.error("Error fetching goal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/goals", async (req, res) => {
  const { userId, category, description, baseline, target, baselineValue, targetValue, unit } = req.body;

  debug("Goal creation request:", { userId, category, description });

  if (!userId) {
    res.status(400).json({ error: "User ID is required" });
    return;
  }

  const categoryError = validateGoalCategory(category);
  if (categoryError) {
    res.status(400).json({ error: categoryError });
    return;
  }

  const descriptionError = validateString(description, "Description", 3, 500);
  if (descriptionError) {
    res.status(400).json({ error: descriptionError });
    return;
  }

  try {
    const userRow = await db.get("SELECT id FROM users WHERE id = ?", [userId]);

    if (!userRow) {
      console.error("User not found:", userId);
      res.status(404).json({ error: `User with ID ${userId} not found` });
      return;
    }

    if (denyUnlessOwner(req, res, userId)) return;

    // Rule 01 says a goal is measured by a number, and progress needs two of them:
    // where you start and what counts as done.
    const baseNum = Number(baselineValue);
    const targetNum = Number(targetValue);
    if (!Number.isFinite(baseNum) || !Number.isFinite(targetNum)) {
      res.status(400).json({
        error: "Give it a starting number and a target, so progress can be tracked.",
      });
      return;
    }
    if (baseNum === targetNum) {
      res.status(400).json({ error: "Start and target can't be the same — there'd be nothing to chase." });
      return;
    }

    // Rule 01: physical output, provable, measured by a number. The numbers above
    // satisfy the last test, so they are what the check reads.
    const eligibility = engine.goalEligibilityError(description, target ?? String(targetNum));
    if (eligibility) {
      res.status(400).json({ error: eligibility });
      return;
    }

    const id = uuidv4();
    const createdDate = new Date().toISOString().split("T")[0];
    const sanitizedDescription = sanitizeString(description);

    await db.run(
      `INSERT INTO goals (
        id, user_id, category, description, baseline, target,
        baseline_value, target_value, unit,
        is_completed, completed_date, created_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        category,
        sanitizedDescription,
        baseline || null,
        target || null,
        Number.isFinite(Number(baselineValue)) ? Number(baselineValue) : null,
        Number.isFinite(Number(targetValue)) ? Number(targetValue) : null,
        unit ? String(unit).slice(0, 20) : null,
        0,
        null,
        createdDate,
      ]
    );

    debug(`Created goal: ${sanitizedDescription} for user ${userId}`);

    const goal = {
      id,
      userId,
      category,
      description: sanitizedDescription,
      baseline: baseline || null,
      target: target || null,
      baselineValue: baseNum,
      targetValue: targetNum,
      unit: unit || null,
      isCompleted: false,
      completedDate: null,
      createdDate,
      proofs: [],
    };

    res.status(201).json(goal);
  } catch (err) {
    if (err.message.includes("FOREIGN KEY constraint failed")) {
      res.status(400).json({ error: `Invalid user ID: ${userId}` });
    } else {
      console.error("Error creating goal:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
});

app.put("/api/goals/:id", async (req, res) => {
  const { description, baseline, target, isCompleted } = req.body;

  const descriptionError = validateString(description, "Description", 3, 500);
  if (descriptionError) {
    res.status(400).json({ error: descriptionError });
    return;
  }

  try {
    const owner = await db.get(
      "SELECT user_id, target_value, is_completed FROM goals WHERE id = ?",
      [req.params.id]
    );
    if (!owner) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    if (denyUnlessOwner(req, res, owner.user_id)) return;

    // Rule 11 gives the challenge title to the most goals completed AT TARGET.
    // A goal with numbers is completed by a reading that reaches the target —
    // POST /api/goals/:id/progress does that. This route is the only other way
    // is_completed could move, so it refuses to move it, in either direction:
    // hand-ticking would be a way to win by clicking, and hand-unticking would
    // be a way to bank a second completion off the same target.
    if (
      isCompleted !== undefined &&
      owner.target_value != null &&
      Boolean(isCompleted) !== Boolean(owner.is_completed)
    ) {
      res.status(400).json({
        error:
          "This goal is measured. Log a reading that reaches the target — completion follows the numbers, not a tap.",
      });
      return;
    }

    const eligibility = engine.goalEligibilityError(description, target);
    if (eligibility) {
      res.status(400).json({ error: eligibility });
      return;
    }

    const sanitizedDescription = sanitizeString(description);

    // null here means "leave completion alone". A measured goal always does —
    // its readings own those two columns. A legacy goal only moves when the
    // caller actually said so; leaving isCompleted out used to silently clear
    // it, which was the same bypass by omission.
    const nextCompleted =
      owner.target_value != null || isCompleted === undefined ? null : isCompleted ? 1 : 0;
    const completedDate = nextCompleted === 1 ? new Date().toISOString().split("T")[0] : null;

    const result = await db.run(
      `UPDATE goals SET
        description = ?,
        baseline = COALESCE(?, baseline),
        target = COALESCE(?, target),
        is_completed = COALESCE(?, is_completed),
        completed_date = CASE WHEN ? IS NULL THEN completed_date ELSE ? END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        sanitizedDescription,
        baseline ?? null,
        target ?? null,
        nextCompleted,
        nextCompleted,
        completedDate,
        req.params.id,
      ]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    debug(`Updated goal: ${req.params.id}`);

    const row = await db.get(`SELECT * FROM goals WHERE id = ?`, [
      req.params.id,
    ]);

    const goal = {
      id: row.id,
      userId: row.user_id,
      category: row.category,
      description: row.description,
      baseline: row.baseline,
      target: row.target,
      baselineValue: row.baseline_value != null ? Number(row.baseline_value) : undefined,
      targetValue: row.target_value != null ? Number(row.target_value) : undefined,
      unit: row.unit,
      isCompleted: Boolean(row.is_completed),
      completedDate: row.completed_date,
      createdDate: row.created_date,
      proofs: [],
    };

    res.json(goal);
  } catch (err) {
    console.error("Error updating goal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/goals/:id", async (req, res) => {
  try {
    const owner = await db.get("SELECT user_id FROM goals WHERE id = ?", [req.params.id]);
    if (!owner) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    if (denyUnlessOwner(req, res, owner.user_id)) return;

    const result = await db.run("DELETE FROM goals WHERE id = ?", [
      req.params.id,
    ]);

    if (result.changes === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    debug(`Deleted goal ID: ${req.params.id}`);
    res.json({ message: "Goal deleted successfully" });
  } catch (err) {
    console.error("Error deleting goal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/goals/stats/:userId", async (req, res) => {
  try {
    const row = await db.get(
      `SELECT
        COUNT(*) as total_goals,
        SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_goals,
        COUNT(DISTINCT category) as categories_covered
      FROM goals
      WHERE user_id = ?`,
      [req.params.userId]
    );

    const stats = {
      totalGoals: row.total_goals || 0,
      completedGoals: row.completed_goals || 0,
      categoriesCovered: row.categories_covered || 0,
      completionRate:
        row.total_goals > 0
          ? Math.round((row.completed_goals / row.total_goals) * 100)
          : 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("Error fetching goal stats:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    const row = await db.get(
      "SELECT challenge_start_date, challenge_end_date, current_week, is_active FROM admin_settings WHERE id = 1"
    );
    if (!row) {
      res.status(404).json({ error: "Season not configured" });
      return;
    }
    res.json({
      challengeStartDate: row.challenge_start_date,
      challengeEndDate: row.challenge_end_date,
      currentWeek: Number(row.current_week),
      isActive: Boolean(row.is_active),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Move the season on.
 *
 * `current_week` is the season's clock: every fine and price level is
 * replayed against it, and nothing was able to write it. Advancing closes the
 * week that just ended, so the fines it produced are posted here — by the same
 * `syncFines` the rest of the app uses, never by rule logic copied into a route.
 *
 * Going backwards is refused by default. Fines come from completed weeks, so a
 * rewind silently un-bills people; `{"force": true}` says you meant it.
 */
app.put("/api/settings", async (req, res) => {
  // Closing a week bills the whole group. Admin only.
  if (denyUnlessAdmin(req, res)) return;

  try {
    const current = await db.get(
      "SELECT challenge_start_date, challenge_end_date, current_week, is_active FROM admin_settings WHERE id = 1"
    );
    if (!current) {
      res.status(404).json({ error: "Season not configured" });
      return;
    }

    const { currentWeek, challengeStartDate, challengeEndDate, isActive, force } = req.body ?? {};
    const from = Number(current.current_week);
    const sets = [];
    const params = [];
    let to = from;

    if (currentWeek !== undefined) {
      to = Number(currentWeek);
      if (!Number.isInteger(to) || to < 1 || to > engine.SEASON_WEEKS) {
        res.status(400).json({ error: `currentWeek must be a whole number from 1 to ${engine.SEASON_WEEKS}` });
        return;
      }
      if (to < from && force !== true) {
        res.status(409).json({
          error:
            `Refusing to move the season back from week ${from} to week ${to}. Fines are derived from ` +
            `completed weeks, so rewinding un-bills people. Send {"force": true} to do it anyway.`,
        });
        return;
      }
      sets.push("current_week = ?");
      params.push(to);
    }

    for (const [value, column] of [
      [challengeStartDate, "challenge_start_date"],
      [challengeEndDate, "challenge_end_date"],
    ]) {
      if (value === undefined) continue;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        res.status(400).json({ error: `${column} must be a YYYY-MM-DD date` });
        return;
      }
      sets.push(`${column} = ?`);
      params.push(value);
    }

    if (isActive !== undefined) {
      sets.push("is_active = ?");
      params.push(isActive ? 1 : 0);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    await db.run(`UPDATE admin_settings SET ${sets.join(", ")} WHERE id = 1`, params);

    // The week that just closed is now scoreable, so bill it. syncFines also
    // voids anything the move stopped being a miss, which is what makes a forced
    // rewind honest rather than just cheap.
    const results = [];
    if (to !== from) {
      try {
        const players = await db.all("SELECT id, name FROM users");
        for (const player of players) {
          const { issued, voided } = await syncFines(player.id);
          if (issued.length || voided.length) {
            results.push({ userId: player.id, name: player.name, issued, voided });
          }
        }
      } catch (err) {
        // The clock and the fines have to move together. There is no transaction
        // to lean on here, so put the week back rather than leave a season that
        // says week N but was never billed for week N-1.
        // ponytail: compensating write, not a transaction — good enough for one row.
        await db.run("UPDATE admin_settings SET current_week = ? WHERE id = 1", [from]);
        res.status(500).json({ error: `Fine sync failed, season left at week ${from}: ${err.message}` });
        return;
      }
    }

    const row = await db.get(
      "SELECT challenge_start_date, challenge_end_date, current_week, is_active FROM admin_settings WHERE id = 1"
    );
    const finesIssued = results.reduce((n, r) => n + r.issued.length, 0);
    const finesVoided = results.reduce((n, r) => n + r.voided.length, 0);
    debug(`Season week ${from} -> ${to}: issued ${finesIssued}, voided ${finesVoided} fine(s)`);

    res.json({
      challengeStartDate: row.challenge_start_date,
      challengeEndDate: row.challenge_end_date,
      currentWeek: Number(row.current_week),
      isActive: Boolean(row.is_active),
      movedFrom: from,
      movedTo: Number(row.current_week),
      finesIssued,
      finesVoided,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GOAL PROGRESS ====================

/**
 * How far along a goal is, as a fraction of the distance from baseline to target.
 *
 * Direction is inferred: a target below the baseline means lower is better (a 5k
 * time), otherwise higher is better (a lift). Returns null when the goal has no
 * numbers to measure against.
 */
// The rules engine owns this — the UI draws its bar from the same function, so
// the server and the board cannot disagree about what "at target" means.
const progressFraction = engine.goalProgressFraction;

app.get("/api/goals/:id/progress", async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT id, value, note, recorded_at FROM goal_progress WHERE goal_id = ? ORDER BY recorded_at ASC, id ASC",
      [req.params.id]
    );
    res.json(rows.map(progressRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Progress is appended, never overwritten — the history is the evidence Rule 01 asks for.
app.post("/api/goals/:id/progress", async (req, res) => {
  try {
    const { value, note } = req.body;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      res.status(400).json({ error: "Progress needs a number" });
      return;
    }
    if (numeric < 0) {
      res.status(400).json({ error: "Progress can't be negative" });
      return;
    }

    const goal = await db.get(
      "SELECT id, user_id, baseline_value, target_value, unit, is_completed FROM goals WHERE id = ?",
      [req.params.id]
    );
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    if (denyUnlessOwner(req, res, goal.user_id)) return;

    const baseline = goal.baseline_value != null ? Number(goal.baseline_value) : null;
    const target = goal.target_value != null ? Number(goal.target_value) : null;

    // Ten goal-ranges away from the baseline is a typo, not a reading. Measured
    // as a fraction of baseline -> target, so it holds whichever way the goal
    // runs: a lift rises, a 5k time falls.
    if (baseline != null && target != null && target !== baseline) {
      if (Math.abs((numeric - baseline) / (target - baseline)) > 10) {
        res.status(400).json({
          error: `${numeric} ${goal.unit || ""}`.trim() + " is nowhere near this goal — check the number",
        });
        return;
      }
    }

    const recordedAt = new Date().toISOString();
    await db.run(
      "INSERT INTO goal_progress (id, goal_id, user_id, value, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      [uuidv4(), req.params.id, goal.user_id, numeric, note ? String(note).slice(0, 200) : null, recordedAt]
    );

    // Hitting the target completes the goal. Nothing else changes here.
    const fraction = progressFraction(baseline, target, numeric);
    const reached = fraction === 1;
    if (reached && !goal.is_completed) {
      await db.run("UPDATE goals SET is_completed = 1, completed_date = ? WHERE id = ?", [
        recordedAt.split("T")[0],
        req.params.id,
      ]);
    }

    res.status(201).json({ value: numeric, recordedAt, progress: fraction, completed: reached });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GROUP FEED ====================

/**
 * What has happened in the season, newest first.
 *
 * Assembled from the records themselves rather than a written-to event log, so
 * the feed can never claim something the data doesn't support.
 */
app.get("/api/feed", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const [users, fines, goals, progress] = await Promise.all([
      db.all("SELECT id, name, avatar FROM users"),
      db.all("SELECT user_id, week, amount, price_level, issued_at, settled_at FROM fines WHERE voided_at IS NULL"),
      db.all("SELECT id, user_id, description, completed_date FROM goals WHERE is_completed = 1"),
      db.all(
        `SELECT p.user_id, p.value, p.recorded_at, g.description, g.unit, g.baseline_value, g.target_value
         FROM goal_progress p JOIN goals g ON g.id = p.goal_id
         ORDER BY p.recorded_at DESC LIMIT 60`
      ),
    ]);

    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const events = [];

    for (const f of fines) {
      events.push({
        kind: "fine",
        userId: f.user_id,
        name: nameOf.get(f.user_id),
        at: f.issued_at,
        text: `missed week ${f.week} — ₹${Number(f.amount).toLocaleString("en-IN")}`,
        amount: Number(f.amount),
      });
      if (f.settled_at) {
        events.push({
          kind: "payment",
          userId: f.user_id,
          name: nameOf.get(f.user_id),
          at: f.settled_at,
          text: `paid ₹${Number(f.amount).toLocaleString("en-IN")} for week ${f.week}`,
          amount: Number(f.amount),
        });
      }
    }

    for (const g of goals) {
      events.push({
        kind: "goal",
        userId: g.user_id,
        name: nameOf.get(g.user_id),
        at: g.completed_date ? `${g.completed_date}T12:00:00.000Z` : null,
        text: `completed "${g.description}"`,
      });
    }

    for (const p of progress) {
      const fraction = progressFraction(
        p.baseline_value != null ? Number(p.baseline_value) : null,
        p.target_value != null ? Number(p.target_value) : null,
        Number(p.value)
      );
      events.push({
        kind: "progress",
        userId: p.user_id,
        name: nameOf.get(p.user_id),
        at: p.recorded_at,
        text: `logged ${p.value}${p.unit ? ` ${p.unit}` : ""} on "${p.description}"`,
        progress: fraction,
      });
    }

    const ordered = events
      .filter((e) => e.at && e.name)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    res.json(ordered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SEASON & FINES ====================

/**
 * Everything the season engine needs about one player, read from the raw record.
 * Fines are derived, never trusted from a stored column — the sheet is the truth.
 */
/**
 * Which season week a player's first one is.
 *
 * Someone who joins in week 11 owes nothing for the ten weeks they were not in.
 * Their start date against the season's start date is the only record of that.
 */
/**
 * What each settled week was actually paid, by week.
 *
 * A replay can re-derive a week's fine at a different price level; it must not
 * re-derive somebody's receipt. Rows settled before the amount was recorded have
 * no entry here, and the engine falls back to the derived fine for those.
 */
const recordedPayments = (fineRows) =>
  Object.fromEntries(
    fineRows
      .filter((r) => r.settled_at && r.settled_amount != null)
      .map((r) => [Number(r.week), Number(r.settled_amount)])
  );

function joinedAtWeek(playerStart, seasonStart) {
  if (!playerStart || !seasonStart) return 1;
  const days = (Date.parse(playerStart) - Date.parse(seasonStart)) / 86400000;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.floor(days / 7) + 1;
}

async function loadSeason(userId) {
  const [workoutRows, fineRows, settings, player] = await Promise.all([
    db.all(
      "SELECT user_id, week, day_of_week, is_completed, kind FROM workout_days WHERE user_id = ?",
      [userId]
    ),
    db.all(
      "SELECT week, amount, settled_at, settled_amount FROM fines WHERE user_id = ? AND voided_at IS NULL",
      [userId]
    ),
    db.get("SELECT current_week, challenge_start_date FROM admin_settings WHERE id = 1"),
    db.get("SELECT start_date FROM users WHERE id = ?", [userId]),
  ]);

  const currentWeek = settings ? Number(settings.current_week) : 1;

  const workoutDays = workoutRows.map((r) => ({
    userId: r.user_id,
    week: Number(r.week),
    dayOfWeek: Number(r.day_of_week),
    kind: r.kind || "session",
    isCompleted: Boolean(r.is_completed),
  }));

  const state = engine.runSeason({
    userId,
    workoutDays,
    settledWeeks: fineRows.filter((r) => r.settled_at).map((r) => Number(r.week)),
    settledAmounts: recordedPayments(fineRows),
    completedWeeks: Math.max(0, currentWeek - 1),
    fromWeek: joinedAtWeek(player?.start_date, settings?.challenge_start_date),
  });

  return { state, currentWeek, workoutRows };
}

/**
 * Write the derived fines to the fines table so they can be settled and shown.
 * Idempotent: replaying the season never double-charges a week.
 */
async function syncFines(userId) {
  const { state } = await loadSeason(userId);
  const existing = await db.all(
    "SELECT id, week, amount, settled_at FROM fines WHERE user_id = ? AND voided_at IS NULL",
    [userId]
  );
  const known = new Set(existing.map((r) => Number(r.week)));

  // A week that is no longer a miss — logged late, say — must
  // stop being billed. Otherwise the fines list demands money the season doesn't.
  const stillFined = new Map(state.weeks.filter((w) => w.fine > 0).map((w) => [w.week, w.fine]));
  const voided = [];
  for (const row of existing) {
    const week = Number(row.week);
    const owedNow = stillFined.get(week);

    if (owedNow == null) {
      await db.run(
        "UPDATE fines SET voided_at = ?, voided_reason = ? WHERE id = ?",
        [
          new Date().toISOString(),
          row.settled_at ? "week no longer fined — paid in credit" : "week no longer fined",
          row.id,
        ]
      );
      voided.push({ week, amount: Number(row.amount), wasSettled: Boolean(row.settled_at) });
      known.delete(week);
    } else if (Number(row.amount) !== owedNow && !row.settled_at) {
      // The price of that week can change when earlier weeks are edited — and the
      // level moves with the amount, or the row reports ₹400 at level 1.
      const level = state.weeks.find((w) => w.week === week)?.priceLevel ?? 1;
      await db.run("UPDATE fines SET amount = ?, price_level = ? WHERE id = ?", [
        owedNow,
        level,
        row.id,
      ]);
    }
  }

  const issued = [];
  for (const week of state.weeks) {
    if (week.fine <= 0 || known.has(week.week)) continue;
    const now = new Date();
    const due = new Date(now.getTime() + PAYMENT_GRACE_HOURS * 60 * 60 * 1000);
    // One row per player-week, forever (UNIQUE(user_id, week)). A week that was
    // voided and then became a miss again — the season moved back and forward,
    // or a logged day was undone — has to revive that row, not insert a second.
    await db.run(
      `INSERT INTO fines (id, user_id, week, amount, price_level, issued_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, week) DO UPDATE SET
         amount = excluded.amount,
         price_level = excluded.price_level,
         issued_at = excluded.issued_at,
         due_at = excluded.due_at,
         voided_at = NULL,
         voided_reason = NULL`,
      [uuidv4(), userId, week.week, week.fine, week.priceLevel, now.toISOString(), due.toISOString()]
    );
    issued.push({ week: week.week, amount: week.fine });
  }

  // Keep the player row in step with what the replay says.
  await db.run(
    "UPDATE users SET price_level = ?, clean_weeks = ?, missed_weeks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [state.priceLevel, state.cleanWeeks, state.missedWeeks, userId]
  );

  return { issued, voided, state };
}

/**
 * The one shape a season is reported in. Both the single-player route and the
 * batch route build their response here, so they cannot drift apart.
 */
function seasonView(user, { state, currentWeek, workoutRows }, unsettled) {
  return {
    userId: user.id,
    name: user.name,
    currentWeek,
    priceLevel: state.priceLevel,
    fineIfMissed: engine.currentFine(state),
    cleanWeeks: state.cleanWeeks,
    missedWeeks: state.missedWeeks,
    cleanStreak: state.cleanStreak,
    missesAtLevel: state.missesAtLevel,
    billed: state.billed,
    paid: state.paid,
    outstanding: state.outstanding,
    potEligible: state.potEligible,
    weeks: state.weeks,
    // Not scored yet — the week is still running.
    currentWeekProgress: {
      week: currentWeek,
      // Credit, not a count: a session is 1 and 10k steps is a half.
      credits: workoutRows
        .filter((r) => Number(r.week) === currentWeek && Boolean(r.is_completed))
        .reduce(
          (sum, r) => sum + (engine.CREDIT_BY_KIND[r.kind] ?? engine.CREDIT_BY_KIND.session),
          0
        ),
      needed: engine.WORKOUTS_PER_WEEK,
    },
    unsettledFines: unsettled.map((f) => ({
      id: f.id,
      week: Number(f.week),
      amount: Number(f.amount),
      issuedAt: f.issued_at,
      dueAt: f.due_at,
      overdue: new Date(f.due_at) < new Date(),
    })),
  };
}

const groupByUser = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.user_id);
    if (list) list.push(row);
    else map.set(row.user_id, [row]);
  }
  return map;
};

// Every player's season in one shot. Same objects as /api/season/:userId, but
// five table reads instead of five per player — Turso charges a round trip each.
app.get("/api/seasons", async (req, res) => {
  try {
    const [users, workoutRows, fineRows, settings] = await Promise.all([
      db.all("SELECT id, name, start_date FROM users ORDER BY name COLLATE NOCASE ASC"),
      db.all("SELECT user_id, week, day_of_week, is_completed, kind FROM workout_days"),
      db.all(
        `SELECT user_id, id, week, amount, settled_at, settled_amount, issued_at, due_at
         FROM fines WHERE voided_at IS NULL ORDER BY week DESC`
      ),
      db.get("SELECT current_week, challenge_start_date FROM admin_settings WHERE id = 1"),
    ]);

    const currentWeek = settings ? Number(settings.current_week) : 1;
    const completedWeeks = Math.max(0, currentWeek - 1);
    const workoutsByUser = groupByUser(workoutRows);
    const finesByUser = groupByUser(fineRows);

    res.json(
      users.map((user) => {
        const mine = workoutsByUser.get(user.id) || [];
        const fines = finesByUser.get(user.id) || [];

        const state = engine.runSeason({
          userId: user.id,
          workoutDays: mine.map((r) => ({
            userId: r.user_id,
            week: Number(r.week),
            dayOfWeek: Number(r.day_of_week),
            kind: r.kind || "session",
            isCompleted: Boolean(r.is_completed),
          })),
          settledWeeks: fines.filter((r) => r.settled_at).map((r) => Number(r.week)),
          settledAmounts: recordedPayments(fines),
          completedWeeks,
          fromWeek: joinedAtWeek(user.start_date, settings?.challenge_start_date),
        });

        return seasonView(
          user,
          { state, currentWeek, workoutRows: mine },
          fines.filter((f) => !f.settled_at)
        );
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full derived state for one player: what a miss costs, what they owe, where they stand.
app.get("/api/season/:userId", async (req, res) => {
  try {
    const user = await db.get("SELECT id, name FROM users WHERE id = ?", [req.params.userId]);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const season = await loadSeason(req.params.userId);
    const unsettled = await db.all(
      `SELECT id, week, amount, issued_at, due_at FROM fines
       WHERE user_id = ? AND settled_at IS NULL AND voided_at IS NULL ORDER BY week DESC`,
      [req.params.userId]
    );

    res.json(seasonView(user, season, unsettled));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The app posts fines itself. Nobody has to notice a missed week by hand.
app.post("/api/fines/sync", async (req, res) => {
  // Posting fines bills real money. Admin only, like closing a week.
  if (denyUnlessAdmin(req, res)) return;
  try {
    const userIds = req.body.userId
      ? [req.body.userId]
      : (await db.all("SELECT id FROM users")).map((r) => r.id);

    const results = [];
    for (const userId of userIds) {
      const { issued, voided, state } = await syncFines(userId);
      results.push({ userId, issued, voided, outstanding: state.outstanding });
    }

    const total = results.reduce((n, r) => n + r.issued.length, 0);
    const retired = results.reduce((n, r) => n + r.voided.length, 0);
    debug(`Fine sync issued ${total} and voided ${retired} across ${userIds.length} player(s)`);
    res.json({ players: results.length, finesIssued: total, finesVoided: retired, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/fines", async (req, res) => {
  try {
    const { userId, unsettled } = req.query;
    const clauses = [];
    const params = [];
    if (userId) {
      clauses.push("user_id = ?");
      params.push(userId);
    }
    if (unsettled === "true") clauses.push("settled_at IS NULL");
    clauses.push("voided_at IS NULL");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = await db.all(
      `SELECT id, user_id, week, amount, price_level, issued_at, due_at, settled_at
       FROM fines ${where} ORDER BY week DESC`,
      params
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        week: Number(r.week),
        amount: Number(r.amount),
        priceLevel: Number(r.price_level),
        issuedAt: r.issued_at,
        dueAt: r.due_at,
        settledAt: r.settled_at,
        overdue: !r.settled_at && new Date(r.due_at) < new Date(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settling clears the balance, and with it the pot eligibility it was blocking.
app.post("/api/fines/:id/settle", async (req, res) => {
  try {
    const fine = await db.get("SELECT id, user_id, amount, settled_at FROM fines WHERE id = ?", [req.params.id]);
    if (!fine) {
      res.status(404).json({ error: "Fine not found" });
      return;
    }
    // Paying happens between people; recording it is the admin's job. A player
    // marking their own fine paid is the whole debt gone for the price of a header.
    if (denyUnlessAdmin(req, res)) return;
    if (fine.settled_at) {
      res.status(409).json({ error: "Fine already settled" });
      return;
    }

    // Record what was paid, not what a later replay would derive.
    await db.run("UPDATE fines SET settled_at = ?, settled_amount = ? WHERE id = ?", [
      new Date().toISOString(),
      Number(fine.amount),
      req.params.id,
    ]);
    const { state } = await syncFines(fine.user_id);

    res.json({ message: "Fine settled", outstanding: state.outstanding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "FitBros 3.0 API is running",
    database: process.env.TURSO_DATABASE_URL ? "Turso" : "SQLite (local)",
    environment: isProduction ? "production" : "development",
    timestamp: new Date().toISOString(),
  });
});

// ==================== CATCH-ALL FOR REACT SPA ====================

if (isProduction && !isVercel) {
  app.get("*", (req, res) => {
    const buildPath = path.join(__dirname, "..", "build", "index.html");
    if (fs.existsSync(buildPath)) {
      res.sendFile(buildPath);
    } else {
      res.status(404).json({ error: "Frontend build not found" });
    }
  });
}

// ==================== ERRORS ====================

/**
 * Anything a route did not catch.
 *
 * Vercel's own guidance: an Express app that renders its own HTML error page
 * leaves the function in an undefined state, because the platform never learns
 * the invocation failed. Answer JSON, say nothing about the internals, and let
 * the log carry the detail.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies a handler as an
// error handler by its four arguments; dropping `next` makes it an ordinary one.
app.use((err, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Try again." });
});

// A request to an endpoint that does not exist is a 404 in JSON, not Express's
// HTML page — every caller here speaks JSON.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
});

// ==================== START SERVER (standalone mode only) ====================

if (!isVercel) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 FitBois 2.0 API Server running on port ${PORT}`);
    console.log(
      `🌍 Environment: ${isProduction ? "production" : "development"}`
    );
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  });

  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down server...");
    process.exit(0);
  });
}

module.exports = app;
