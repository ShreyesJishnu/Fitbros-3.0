# UX checklist

Twenty principles, audited against the code as it stands. Status is what was
verified, not what was intended — an item is only `done` if something in the
app actually does it.

Legend: `[ ]` to do · `[x]` done · `[—]` not applicable, with the reason.

---

## The animation principles

- [ ] **1. Squash and stretch** — a thing that is acted on deforms, and keeps its
  volume while it does. Partly here: the day-cell icon pops `0.4 → 1.15 → 1`,
  which is stretch on arrival. Missing on the cell itself, which only shrinks
  (`active:scale-95`) and springs back flat.
  → *Cell squashes on press and overshoots on release, wider than it is tall.*

- [ ] **2. Anticipation** — wind up before the act, so the act is read as caused.
  Nothing anticipates anywhere. `active:scale-95` is a reaction, not a wind-up.
  → *The cell dips before the icon arrives, not at the same moment.*

- [ ] **3. Staging** — one thing asks to be read first. Mostly here: the nudge
  banner and "N more workouts this week" sit above the grid. Weak on the Group
  tab, where four stat tiles, an overdue banner and a roll-call all open at once.
  → *Give the group page one lead, and let the rest arrive behind it.*

- [—] **4. Pose to pose** — an animator's sequencing workflow, not a property a
  UI has. A CSS keyframe is already two defined poses with a computed middle.

- [ ] **5. Follow through and overlapping action** — parts arrive at different
  times and settle at different rates. Everything in this app lands on the same
  frame: tap a day and the cell, the credit count, the strip and the nudge all
  change together.
  → *Cell first, then the count, then the strip. The legend last.*

- [x] **6. Slow in, slow out** — `cubic-bezier(.32,.72,0,1)` is the house curve
  (`ease-settle` in the Tailwind config) and is on essentially every transition
  and keyframe already.

- [—] **7. Arcs** — natural movement travels on a curve, and the confetti already
  falls on real parabolas under gravity. Everything else here is a rectangle in a
  grid or a sheet against an edge, and the only way to put those on a curve is a
  lateral wobble, which reads as broken rather than natural. Tried on paper,
  rejected: the honest arc in this app is the one that already exists.

- [ ] **8. Secondary action** — a supporting motion that enriches the main one
  without competing. There is none: every animation in the app is the primary
  act of some element.
  → *A clean week nudges the two bars beside it as it lands.*

- [ ] **9. Timing** — snappy where it is feedback, slower where it is a journey.
  Durations run 150–650ms and were each picked on their own, never against each
  other.
  → *Audit every duration in one pass; publish the scale; delete the outliers.*

- [x] **10. Exaggeration** — hitting four credits fires a 70-piece confetti burst
  from the cell that did it. Already the loudest thing in the app, deliberately.

- [—] **11. Solid drawing (3D)** — the app is flat on purpose: ink on paper, one
  card shadow, no depth. Read instead as *consistent weight*, which items 1 and
  7 cover: things grow from a fixed anchor and keep their mass.

- [ ] **12. Appeal** — the whole thing should be worth opening. Subjective, and
  the only item here with no single change behind it. Judged at the end, not
  ticked off.

---

## The laws

- [ ] **13. Fitts's law** — time to hit a target falls with size and rises with
  distance. Mostly held: nav 56px, day cells 56px, close and action buttons 44px.
  Two misses: the "fix an earlier week" select is 40px, and the toast's dismiss
  button is a bare `p-1` icon.
  → *Raise both to 44px.*

- [ ] **14. Hick's law** — decision time rises with the number of choices. One
  bad offender: "fix an earlier week" is a flat `<select>` that reaches 24
  options by the end of the season, in a season where almost every correction is
  to the week just gone.
  → *Offer the last three weeks, and put the rest behind "earlier".*

- [ ] **15. Miller's law** — about seven items held at once. The group table runs
  six columns on desktop plus a name; the stat rows are four. To check against
  the real screens rather than asserted.

- [x] **16. Doherty threshold** — under 400ms or attention wanders. The day cell
  paints from the tap in ~60ms (measured) and reconciles with the server after.
  Everything else is a read, behind a skeleton.

- [ ] **17. Postel's law** — be liberal in what you accept. The app is strict and
  silent: a goal reading of `70kg` or `70 kg` is `Number(…) === NaN`, and
  `submitReading` returns without posting **and without saying anything**. The
  button looks broken.
  → *Accept units, spaces and thousands separators. Say so when it truly can't
  be read.*

- [ ] **18. Jakob's law** — people expect this to work like everything else they
  use. Bottom tab bar on mobile, top nav on desktop, both conventional. To check:
  whether the day-cell tri-state cycle (nothing → session → steps → nothing) is
  guessable without being told, since nothing else people use behaves that way.

- [ ] **19. Frequency of use** — the most common act should be the least work.
  Logging a day is ~95% of what anyone does here, and the app does open on Me
  with the grid above the fold. To check: how many taps from a cold open to a
  logged day, counting the app launch.

---

## Order of work

1. **Motion** (1, 2, 5, 7, 8) — the ones that change how logging feels.
2. **Laws** (13, 14, 17) — concrete defects with concrete fixes.
3. **Structure** (3, 9, 15, 18, 19) — needs measuring before deciding.
4. **Appeal** (12) — judged at the end.
