# FitBros 3.0

## How to communicate with Shreyes

These are standing rules for every response in this project. They do not lapse
when the topic changes or after a long session. If unsure whether they apply,
they do.

1. **Start every response with his first name.** "Shreyes — …".
2. **Lead with the next action.** A command, a path, a decision. Never a preamble,
   never "Let me…" or "Great question".
3. **Number multi-step work.** One bounded action per step. Cut steps he doesn't
   need rather than listing everything that happened.
4. **Cap lists at five.** Rank them. Five ranked beats ten unranked.
5. **Restate state every turn.** He can't hold "step 3 of 5" between messages.
6. **End with one concrete next action** — something doable in under two minutes.
7. **No recaps, no closing pleasantries.** No "Let me know if…", no "Hope this
   helps". Stop when the answer is done.
8. **Errors are matter-of-fact.** State cause and fix. Never "Uh oh" or "It seems".
9. **Terse prose.** Drop articles and filler where it doesn't cost clarity.
   Fragments are fine. Code, commits and security notes stay written normally.
10. **Long blocks of text do not get read.** If the explanation is longer than the
    change, delete the explanation.

Two plugins carry these rules and should stay on: `caveman` (terse prose) and
`i-have-adhd` (action-first shape). The ADHD plugin is user-invocation-only —
it cannot be started from inside a turn, so if its shape is missing, say so
plainly rather than imitating it.

Exceptions, where the task outranks the shape: he asks to "explain" or "walk me
through" (answer fully, still no preamble), a destructive action needs
confirmation, or he asks for options (give 2–4 ranked with trade-offs).

## What this project is

A 24-week fitness accountability season for a group of friends, with real money
attached. The rules are the product; the app only reports what the rules decide.

- **A clean week is 4 workouts' worth of credit.** A session is 1, a 10k-step day
  is ½. A day logs once, so a week can never be walked clean (7 × ½ = 3.5) —
  which is also why 4 is the floor: at 3, walking alone would clear it.
- **A missed week costs money** — ₹200 to start. Two misses at one price double
  it (₹200, ₹400, ₹800, ₹1,600 …, no ceiling); two clean weeks in a row halve it.
- **Nothing takes you out of the season.** No suspension, no elimination. A fine
  has a 48-hour deadline, but missing it costs nothing beyond still owing.
- **The pot** splits between everyone with nothing outstanding. A fined week does
  not cost you a share; an unpaid one does.
- **Goals:** 6 points across 2–6 goals, worth 3/2/1. Physical, numbered, provable.
- **Gone deliberately:** skip tokens, weekly plans and swaps, the standing
  machine. Sickness, injury and travel are handled between people, not in code.

## Architecture rules

- `src/utils/seasonEngine.js` is the single owner of the rules. The Express
  server requires the very same file the React app imports, so the API and UI
  can never disagree. It is plain CommonJS for that reason; types live in the
  sibling `.d.ts`.
- **Everything derived is replayed, never stored.** Price level, standing, fines
  and pot eligibility all come from replaying the workout sheet. There is no
  stored state to drift.
- **Fines are derived, then reconciled.** `syncFines` posts new ones and voids
  any whose week stopped being a miss.
- **Every rule constant lives in the engine**, including the payment deadline.
  A file that needs one imports it — no second copy in the server or a script.
- Writes carry `x-player-id` and the server holds the caller to it. That is an
  ownership check, not authentication.
- The season's current week comes from `admin_settings`, via `GET /api/settings`.
  Never recompute it from dates — that bug has been fixed twice.

## Working agreements

- Verify in the browser, not by assertion. A screenshot or a measured value, not
  "should work".
- Non-trivial logic leaves one runnable check behind (`npm test`).
- Run `npx tsc --noEmit` before saying something is done.
- Local dev: `nohup env PORT=5050 node backend/server.js &` and `npm start`.
  `node backend/scripts/seedFakeSeason.js` seeds nine players covering every
  state the rules can produce. It refuses to run against a Turso database.
