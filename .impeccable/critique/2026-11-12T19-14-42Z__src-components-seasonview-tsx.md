---
target: the season page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/shreyesjishnu/Documents/fitbois-2.0/src/components/SeasonView.tsx"
target_fingerprint: "sha256:157a692721504d624905c5d2098a74f8f0bfb0c0012c6dcfd8551ba9537297f1"
target_path: /Users/shreyesjishnu/Documents/fitbois-2.0/src/components/SeasonView.tsx
timestamp: 2026-11-12T19-14-42Z
slug: src-components-seasonview-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated).
Deviation: B returned before A, so synthesis saw measurements before the unanchored review. A never saw B.

## Design Health Score — 24/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Tapping a day produces nothing for ~700ms. No optimistic fill, spinner or disabled state. |
| 2 | Match System / Real World | 3 | `Week 9 — 5/4 clean` reads as five-out-of-four; PlayerSheet's `5 clean` has no unit. |
| 3 | User Control and Freedom | 3 | Cycle reversible, no confirm. Un-logging silently re-bills a fine with no undo. |
| 4 | Consistency and Standards | 2 | Same nine players twice in one scroll, two different orders, unexplained. |
| 5 | Error Prevention | 3 | Settled weeks disabled; ownership checked server-side. Nothing guards the destructive third tap. |
| 6 | Recognition Rather Than Recall | 2 | Week identity in the season strip lives only in `title=` — dead on touch. |
| 7 | Flexibility and Efficiency | 2 | 4,930px = 6.1 phone screens. No jump-to-your-own-row. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained, but name 3x in first viewport and a changelog in the bottom third. |
| 9 | Error Recovery | 2 | Generic retry copy. `paid, locked` explains itself only after you pick another week. |
| 10 | Help and Documentation | 2 | `Rules` is a sibling tab; not one term on this page links to it. |

## Design Specificity Verdict

Mostly specific, with two generic organs grafted on.

Specific: the day button's three states encode the 1 / 1/2 credit rule as a gesture; `A miss costs 200` at display size is the thesis as typography; the overdue line is a rule written as reassurance.

Generic: `Lately` is a changelog with 30 undifferentiated rows in the bottom third; `Clean weeks — the order` re-lists the nine people the table already listed; `WhoYouAre` is a settings-screen profile card where the stakes should be.

The rules are expressed with real specificity; the page composition is not.

Deterministic scan: 2 findings (exit 2), both `border-accent-on-rounded` at src/App.tsx:445 and :489. Both FALSE POSITIVES — `border-b-2` on `rounded-full` + `animate-spin` is the canonical spinner idiom. Zero findings across nine component files.

Disagreement: A flagged `text-ink-faint` as a contrast risk from token values; B measured 373 text nodes per theme and found ZERO WCAG failures (floor 5.20:1 light, 6.71:1 dark). Do not change colours on this evidence; the issue is 10-11px sizing carrying distinct meaning.

Detector caught what the review missed: 9 of 25 tap targets under 44px on a phone — all seven day buttons at 42.7x56, theme toggle 40x40, week select 263x40.

No visual overlay was injected; evidence is CLI scan plus measured DOM.

## Overall Impression

Component-level craft is high. The problem is one level up: the page was assembled, not composed. Merging two tabs stacked two information architectures without reconciling them — facts stated three and four times in different words and orders, six phone screens long, in service of a goal that was explicitly less time in the app. Biggest opportunity: the most at-risk players are structurally prevented from seeing the warning that would save them.

## What's Working

1. The three-state day button: one 56px tap, no modal, reversible, the 1/2-credit rule inside the gesture. `aria-pressed`, composed label stating current state and next tap, `sr-only` credit value. One `DayGrid` for both live week and corrections.
2. The copy refuses to punish — a product decision made in words, doing the work a Rules page would otherwise do, at the moment of doubt.
3. The colour system is built, not decorated: semantic tokens through CSS variables, dark re-picked not inverted, chart steps validated for deuteranopia, every outcome carried by text as well as colour. Zero contrast failures across 746 measured nodes.

## Priority Issues

### [P0] Primary action gives no feedback; the retry silently halves your credit
MySeason.tsx:322 — `cycleDay` awaits the server then `setTimeout(load, 400)`. Nothing changes between tap and response. Phone, gym, cellular: user taps, sees nothing, taps again. Second tap does not retry — it advances the cycle, turning a session (1 credit) into 10k steps (1/2), toast says "walked it!". Direct path to an unearned 200 fine. 42.7px targets make the miss-tap likelier.
Fix: paint the next state optimistically, reconcile on response, revert on failure; ignore repeat taps on the same cell in flight; delete the 400ms timer.
Command: /impeccable harden

### [P1] Owing money suppresses the workout warning
MySeason.tsx:212 — `nudgeFor` returns the money message and exits before schedule urgency. Anyone with a balance never sees "3 left, 3 days to go". Debtors sit at a higher price level so their next miss costs most, and they are the only ones not warned. The halving message lives in the `clean` branch, unreachable by whoever needs it.
Fix: return both; lead with today's action, carry debt as a standing condition.
Command: /impeccable clarify

### [P1] The same nine players appear in two contradictory orders
Table sorts pot-eligibility first (Clean column reads 10,7,7,7,3,9,9,7); the ranking 400px below sorts by clean weeks. Only cue is a 12px trophy, absent on mobile. A money scoreboard that looks mis-sorted reads as a bug.
Fix: one order, shown once. Likely delete GroupStats and move "You are 4th of 9" into the group header. Removes a contradiction and ~500px.
Command: /impeccable distill

### [P1] The group board is invisible to screen readers and unreachable by keyboard
GroupBoard.tsx:369 — each row is `<button aria-label="Open X's season">` wrapping all content; ARIA presentational children discard the day strips, standings and owed amounts. GroupBoard.tsx:443 is `<tr onClick>` with no tabIndex/role/key handler — the player sheet cannot be opened by keyboard on desktop.
Fix: drop the wrapping button, focusable control on the name, row content in normal flow; real control in the desktop Player cell.
Command: /impeccable audit

### [P2] "Fix an earlier week" becomes a 24-option select with a silent dead end
WEEKS_EDITABLE_BACK = Infinity, so the select grows all season; options are four-clause compound strings on a mobile wheel. The `paid, locked` option is disabled and its explanation renders only after selecting a different week.
Fix: make the `Your season` strip tappable; move the locked explanation out of the conditional.
Command: /impeccable layout

## Persona Red Flags

Casey (distracted mobile): taps Fri, nothing happens, taps again, logs 1/2 credit believing it is a workout. Then four screens of scroll, nine rows, no jump-to-own-row; sits below Neha in the table so the glanced answer is wrong.

Jordan (first-timer): told his name twice in 400px. Seven grey boxes with no instruction they are tappable — no +, no hint, white-on-cream in light theme. "4 more workouts this week" is a state, not an action. `A miss costs 200` unexplained, no link to Rules from any term. Taps Priya's Wednesday, gets someone else's modal.

Sam (accessibility): group board collapses to nine names; desktop table not keyboard-openable; PlayerSheet has aria-modal and focus restore but NO focus trap. Plus 30 feed SVGs with no accessible name or aria-hidden, day-grid wrapper with no role or label, and four sections rendering as generic divs so heading navigation skips them.

## Minor Observations

- role="status" on the nudge re-announces the whole paragraph after every day tap.
- STREAK is the only stat tile with no colour, yet streak drives the halving rule.
- WeekStrip progress fill at 1/4 is an 8px wash in a 32px cell — invisible on a phone.
- Schedule pressure painted in `owed` (money red): "behind" and "owe money" are the same colour.
- Every data call fires twice per load, /api/seasons four times — consistent with StrictMode in dev, unconfirmed against a production build.
- No horizontal overflow at 375 or 1100; zero console errors; zero failed requests.

## Questions to Consider

1. Why does this page open with the user's name instead of the user's stake?
2. Is "Lately" earning its 1,500px? Three of four charts were deleted for being unused.
3. What is the app's job in the last 48 hours of a week it restates as impossible?
4. Should "one clean week from 400" be permanent furniture rather than an unreachable nudge branch?
5. The week strip is the best summary on the page and it is read-only. What is lost if tapping a block is "fix an earlier week"?
