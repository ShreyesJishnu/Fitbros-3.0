# FitBros 3.0 — Season Tracker

A 24-week fitness accountability season for a group of friends, with real money
attached. The rules are the product; the app only reports what the rules decide.

## The season

**Timeline:** 24 weeks · **Buy-in:** the fines you pay

### Rules

- **A clean week is 4 workouts' worth of credit.** A session is 1, a 10k-step
  day is ½. A day logs once, so a week can never be walked clean (7 × ½ = 3.5)
  — which is also why 4 is the floor: at 3, walking alone would clear it.
- **A missed week costs money** — ₹200 to start. Two misses at one price double
  it (₹200, ₹400, ₹800, ₹1,600 …, no ceiling); two clean weeks in a row halve it.
- **Nothing takes you out of the season.** No suspension, no elimination. A fine
  has a 48-hour deadline, but missing it costs nothing beyond still owing — it
  stops being private, and the group sees who owes what.
- **A week can be excused.** Injury, and whatever else the group agrees. The
  week is recorded as one they were away for and then not judged: no fine, and
  no strike against the price. Who gets excused is settled between people.
- **The pot** splits between everyone with nothing outstanding. A fined week does
  not cost you a share; an unpaid one does. Leaving the season does not take
  back fines you already paid — they stay in the pot.
- **Goals:** carry no points and no money. Yours to pick, whatever the subject —
  the only rule is a start number and a target, so progress can be followed.

**Gone deliberately:** skip tokens, weekly plans and swaps, the standing machine.

The rules live in the app under **Rules**, and in `src/data/rules.ts` — that file
is the one the group agreed; this is a summary of it.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide icons |
| **Backend** | Express (Vercel Serverless Functions) |
| **Database** | Turso (libSQL — cloud SQLite) |
| **Hosting** | Vercel (free tier) |

## Project Structure

```
fitbois-2.0/
├── api/index.js                 # Vercel serverless entry point — requires backend/server.js
├── backend/
│   ├── server.js                # The whole API: users, workouts, goals, fines, the season clock
│   ├── schema.js                # Tables, migrations and the probes a cold start asks
│   ├── initDatabase.js          # Creates or migrates the database on first request
│   ├── db.js                    # Turso in production, a local SQLite file in development
│   └── scripts/
│       ├── verifyRules.js       # Drives a running API and checks every rule that decides money
│       ├── checkSchema.js       # Would a cold start notice a database that is behind?
│       └── seedFakeSeason.js    # Nine players covering every state the rules produce
├── src/
│   ├── utils/seasonEngine.js    # THE RULES. Plain CommonJS so the server requires the same file
│   ├── components/              # GroupBoard, MySeason, PlayerSheet, GoalBoard, Admin, Rules…
│   ├── services/http.ts         # apiFetch — who you are rides on every request
│   ├── data/rules.ts            # The rulebook, as the group agreed it
│   └── App.tsx
├── .github/workflows/checks.yml # Types, tests, schema probes, and the build Vercel runs
└── vercel.json
```

`src/utils/seasonEngine.js` is the single owner of the rules. The Express server
requires the very same file the React app imports, so the API and the UI can
never disagree. Everything derived — price level, fines, pot eligibility — is
replayed from the workout sheet rather than stored, so there is no state to drift.

## Getting Started

### Prerequisites

- Node.js >= 22
- A [Turso](https://turso.tech) account (free tier) — or skip for local dev with SQLite

### Install

```bash
npm install
```

### Checks

```bash
CI=true npm run build   # what the deploy runs — a lint warning fails it
npm test                # the rules engine and the screen helpers
node backend/scripts/checkSchema.js
```

`backend/scripts/verifyRules.js` drives a running API through every rule that
decides money. It writes test data, so point it at a seeded local database and
never at Turso:

```bash
node backend/scripts/seedFakeSeason.js
PORT=5050 ADMIN_KEY=test-secret node backend/server.js &
node backend/scripts/verifyRules.js
```

### Run locally

Start the backend (connects to local SQLite file by default):

```bash
PORT=5050 node backend/server.js
```

Start the frontend:

```bash
npm start
```

To connect to Turso instead of local SQLite, create a `.env` file (see `.env.example`) with your `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

### Deploy

Vercel serves the built React app and runs `backend/server.js` as a serverless
function through `api/index.js`, so the app and the API share one origin and the
frontend talks to a relative `/api`. Pushing to `main` deploys production; any
other branch gets a preview URL.

**Required Vercel environment variables**

| Variable | Where it comes from |
|---|---|
| `TURSO_DATABASE_URL` | `turso db show <name> --url` |
| `TURSO_AUTH_TOKEN` | `turso db tokens create <name>` |
| `ADMIN_KEY` | **set this.** Any long random string — it is the admin seat (see below). Set it for Preview too, or a preview build is an open admin console on the live database. |
| `REQUIRE_PLAYER_SECRET` | `1` once everybody has their `?me=<id>.<secret>` link. Until then an id alone is accepted, and every id is public. |
| `CRON_SECRET` | Set by Vercel for the scheduled job. The season also winds itself forward on read, so the cron is a belt to that pair of braces. |

A serverless function has no disk, so the local SQLite file is not an option in
production — Turso is required. The schema creates itself on the first request
after a cold start, including the column migrations for a database that predates
3.0, so there is no separate migration step.

### Who is admin

There is no login. Players identify themselves with `x-player-id`, which the
"Playing as" picker sets — fine inside a group of friends, since the worst a
player can do is edit their own record.

The admin seat is a shared secret instead. Set `ADMIN_KEY` in the Vercel
environment, then open the app **once** as:

    https://<your-app>/?admin=<the key>

The key is stored on that device, stripped from the URL, and sent as
`x-admin-key` on every request afterwards. `?admin=` with nothing after it
forgets it again. Only a device holding the key sees the Admin tab, and — the
part that matters — only it can add, edit or remove players or close a week.
Everyone else gets a 403 from the server, whatever their browser thinks.

With no `ADMIN_KEY` set at all, the admin routes stay open. That is deliberate
for local work and wrong for production, so set the variable before you share
the link.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user by ID |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |
| `GET` | `/api/goals` | List all goals |
| `GET` | `/api/goals/user/:userId` | Goals for a user |
| `POST` | `/api/goals` | Create goal |
| `PUT` | `/api/goals/:id` | Update goal |
| `DELETE` | `/api/goals/:id` | Delete goal |
| `GET` | `/api/workouts` | List all workouts |
| `GET` | `/api/workouts/user/:userId` | Workouts for a user |
| `POST` | `/api/workouts` | Create/update workout |
| `DELETE` | `/api/workouts/:id` | Delete workout |
| `GET` | `/api/weekly-plans` | List all plans |
| `POST` | `/api/weekly-plans` | Upsert plan |
| `GET` | `/api/health` | Health check |

## License

Private project for FitBois 2.0 challenge participants.
