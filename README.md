# FitBros 3.0 — Season Tracker

A 24-week fitness accountability season for a group of friends, with real money
attached. The rules are the product; the app only reports what the rules decide.

## The season

**Timeline:** 24 weeks · **Buy-in:** the fines you pay

### Rules

- **A clean week is 4 workouts.** Flat, for everyone.
- **A missed week costs money** — ₹500 → ₹1,000 → ₹2,000. Three misses at one price raise it; three clean weeks lower it.
- **Missing never eliminates you. Not paying does.** Active → Suspended (unpaid past 48h) → Out (two fines while suspended). No buy-backs.
- **Skip tokens:** 3 a season, never 3 in a row, never in the last two weeks.
- **Goals:** carry no points and no money. Yours to pick, whatever the subject —
  the only rule is a start number and a target, so progress can be followed.
- **The pot** splits between everyone still standing with nothing outstanding. A fined week does not cost you a share.

The full 12 rules live in the app under **Rules**, and in `src/data/rules.ts`.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide icons |
| **Backend** | Express (Vercel Serverless Functions) |
| **Database** | Turso (libSQL — cloud SQLite) |
| **Hosting** | Vercel (free tier) |

## Project Structure

```
FitBois 2.0/
├── api/
│   └── index.js              # Vercel serverless entry point
├── backend/
│   ├── db.js                  # Turso/libSQL database client
│   ├── server.js              # Express API (users, goals, workouts, plans)
│   ├── scripts/
│   │   └── safeInitDatabase.js
│   └── package.json
├── src/                        # React frontend
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── Goals.tsx
│   │   ├── Workout.tsx
│   │   ├── Admin.tsx
│   │   └── ...
│   ├── services/api.ts
│   ├── utils/
│   │   ├── consistencyCalculator.ts
│   │   └── dateUtils.ts
│   ├── types.ts
│   └── App.tsx
├── vercel.json
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 22
- A [Turso](https://turso.tech) account (free tier) — or skip for local dev with SQLite

### Install

```bash
npm install
cd backend && npm install
```

### Run locally

Start the backend (connects to local SQLite file by default):

```bash
cd backend && node server.js
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
| `ADMIN_KEY` | **set this.** Any long random string — it is the admin seat (see below). |

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
