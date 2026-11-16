import React, { useCallback, useEffect, useRef, useState } from "react";
import { GroupRow } from "./GroupBoard";
import Streak from "./Streak";
import { DAY_LABEL } from "./DayCells";
import { todayIndex } from "../utils/today";
import { cleanRun, heatClass, isWeekClean, liveStreak } from "../utils/streak";
import { WorkoutDay, WorkoutKind } from "../types";

/**
 * The whole squad in one picture.
 *
 * With nine people and a handful of weeks, a line chart draws trends that are
 * not there. This shows every week every player had, as a square: read across a
 * row for one person, down a column for the group that week. The bars on top
 * are the squad's health — how many of the group kept that week clean.
 */

/** What the squad needs from a /seasons row — the Me and Group screens both have one. */
export type SquadRow = Pick<
  GroupRow,
  "userId" | "name" | "weeks" | "currentWeekProgress" | "cleanStreak" | "cleanWeeks"
> & { avatar?: string | null };

export interface WeekPulse {
  week: number;
  clean: number;
  /** Players the week was judged for: excused weeks and weeks before joining are not. */
  judged: number;
}

/** Closed weeks only; the running week is shown as progress, not judged. */
export const squadPulse = (rows: SquadRow[], currentWeek: number): WeekPulse[] =>
  Array.from({ length: Math.max(0, currentWeek - 1) }, (_, k) => {
    const week = k + 1;
    let clean = 0;
    let judged = 0;
    for (const r of rows) {
      const w = r.weeks.find((x) => x.week === week);
      if (!w || w.outcome === "excused") continue;
      judged++;
      if (w.outcome === "clean") clean++;
    }
    return { week, clean, judged };
  });

export const squadHealth = (pulse: WeekPulse[]): number | null => {
  const judged = pulse.reduce((s, p) => s + p.judged, 0);
  return judged ? Math.round((pulse.reduce((s, p) => s + p.clean, 0) / judged) * 100) : null;
};

/** Clean is not a lookup: its green deepens with the run, see `heatClass`. */
const CELL: Record<string, string> = {
  missed: "bg-owed-500/80",
  excused: "bg-ink-faint/30",
};

/** One player's week as seven days, Monday first, read from the workout sheet. */
export const weekDays = (workoutDays: WorkoutDay[], userId: string, week: number): (WorkoutKind | null)[] => {
  const days: (WorkoutKind | null)[] = Array(7).fill(null);
  for (const w of workoutDays)
    if (w.userId === userId && w.week === week && w.isCompleted && w.dayOfWeek >= 1 && w.dayOfWeek <= 7)
      days[w.dayOfWeek - 1] = w.kind ?? "session";
  return days;
};

export interface WeekPeek {
  title: string;
  status: string;
  detail: string;
  tone: "clean" | "owed" | "muted";
}

/** What tapping one square says: that player's week, in a sentence or two. */
export const weekPeek = (row: SquadRow, week: number, currentWeek: number): WeekPeek => {
  const { credits, needed } = row.currentWeekProgress;
  if (week === currentWeek) {
    const clean = isWeekClean(row.currentWeekProgress);
    return {
      title: `Week ${week} · this week`,
      status: clean ? "Cleared" : `${needed - credits} to go`,
      detail: `${credits} of ${needed} credits so far`,
      tone: clean ? "clean" : "muted",
    };
  }
  const w = row.weeks.find((x) => x.week === week);
  if (!w) return { title: `Week ${week}`, status: "Not in yet", detail: "Before they joined the season", tone: "muted" };
  if (w.outcome === "excused")
    return { title: `Week ${week}`, status: "Away", detail: "Excused — not judged", tone: "muted" };
  const of = `${w.credits} of ${needed} credits`;
  if (w.outcome === "missed")
    return { title: `Week ${week}`, status: `Fined ₹${w.fine.toLocaleString("en-IN")}`, detail: of, tone: "owed" };
  const run = cleanRun(row.weeks).get(week) ?? 1;
  return { title: `Week ${week}`, status: "Clean", detail: run > 1 ? `${of} · ${run} clean in a row` : of, tone: "clean" };
};

const TONE: Record<WeekPeek["tone"], string> = {
  clean: "text-clean-600",
  owed: "text-owed-600",
  muted: "text-ink",
};

interface Peek {
  userId: string;
  week: number;
  /** Where to draw it, relative to the section, so it scrolls with the board. */
  left: number;
  top: number;
}

const PEEK_W = 224;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * One player's week, read-only. A workout fills the day; 10k steps is worth half
 * a workout, so it fills half of it.
 */
const WeekStrip: React.FC<{ days: (WorkoutKind | null)[]; today?: number; who: string }> = ({ days, today, who }) => (
  <div className="grid grid-cols-7 gap-1" role="list" aria-label={who}>
    {days.map((kind, i) => (
      <div
        key={i}
        role="listitem"
        aria-label={`${DAY_NAMES[i]}: ${kind ? DAY_LABEL[kind] : "nothing logged"}`}
        className={`relative h-9 rounded-lg border overflow-hidden grid place-items-center text-[11px] font-semibold ${
          i === today ? "ring-2 ring-inset ring-ink" : ""
        } ${
          kind === "session"
            ? "bg-clean-500 border-clean-500 text-paper"
            : kind === "steps"
              ? "border-clean-500 text-ink"
              : "bg-paper-card border-line text-ink-faint"
        }`}
      >
        {kind === "steps" ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-clean-500" /> : null}
        <span className="relative">{DAY_NAMES[i].charAt(0)}</span>
      </div>
    ))}
  </div>
);

/** How long a finger rests on a square before dragging reads the squares instead of scrolling. */
const HOLD_MS = 250;

const SquadWall: React.FC<{
  rows: SquadRow[];
  currentWeek: number;
  currentUserId?: string;
  /** Everyone's logged days: the popup draws the tapped week from them. */
  workoutDays: WorkoutDay[];
}> = ({ rows, currentWeek, currentUserId, workoutDays }) => {
  const pulse = squadPulse(rows, currentWeek);
  const health = squadHealth(pulse);
  const clearedNow = rows.filter((r) => isWeekClean(r.currentWeekProgress)).length;
  const ranked = [...rows].sort(
    (a, b) => liveStreak(b) - liveStreak(a) || b.cleanWeeks - a.cleanWeeks || a.name.localeCompare(b.name)
  );
  const cols = `minmax(0, 5.5rem) repeat(${currentWeek}, minmax(0, 1.75rem)) 2.75rem`;

  // One square's week at a time; tapping it again, anywhere else, or Escape closes it.
  const [peek, setPeek] = useState<Peek | null>(null);
  useEffect(() => {
    if (!peek) return;
    const close = () => setPeek(null);
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-peek]")) close();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", esc);
    };
  }, [peek]);

  const section = useRef<HTMLElement>(null);
  /** Open a square's week above it. A tap on the open square closes it; a drag never does. */
  const show = useCallback((el: HTMLElement, toggle: boolean) => {
    const box = section.current?.getBoundingClientRect();
    const userId = el.dataset.user;
    const week = Number(el.dataset.week);
    if (!box || !userId || !week) return;
    const r = el.getBoundingClientRect();
    setPeek((p) =>
      p?.userId === userId && p.week === week
        ? toggle
          ? null
          : p
        : {
            userId,
            week,
            left: Math.min(Math.max(0, r.left - box.left + r.width / 2 - PEEK_W / 2), box.width - PEEK_W),
            // Above the square, where the finger holding it does not cover it.
            top: r.top - box.top - 8,
          }
    );
  }, []);

  // Press and hold a square, then drag: the popup follows whichever square is under
  // the finger. Native listeners, because React's touchmove is passive and only a
  // non-passive one can stop the page scrolling under a drag.
  const grid = useRef<HTMLDivElement>(null);
  /** When the last hold-and-drag let go: the click a release fires is not a tap. */
  const heldUntil = useRef(0);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    let timer = 0;
    let from: { x: number; y: number } | null = null;
    let scrubbing = false;
    const squareAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-week]") ?? null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const sq = e.touches.length === 1 ? squareAt(t.clientX, t.clientY) : null;
      if (!sq) return;
      from = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        scrubbing = true;
        show(sq, false);
      }, HOLD_MS);
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (scrubbing) {
        e.preventDefault();
        const sq = squareAt(t.clientX, t.clientY);
        if (sq) show(sq, false);
      } else if (from && Math.hypot(t.clientX - from.x, t.clientY - from.y) > 8) {
        // Moved before the hold landed: that is a scroll, leave it alone.
        window.clearTimeout(timer);
        from = null;
      }
    };
    const end = () => {
      if (scrubbing) heldUntil.current = Date.now() + 500;
      window.clearTimeout(timer);
      from = null;
      scrubbing = false;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [show]);

  const peekRow = peek && ranked.find((r) => r.userId === peek.userId);
  const peekInfo = peek && peekRow ? weekPeek(peekRow, peek.week, currentWeek) : null;

  return (
    <section ref={section} aria-labelledby="squad-title" className="relative">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="squad-title" className="display text-2xl leading-none">
            The squad
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            {clearedNow
              ? `${clearedNow} of ${rows.length} already cleared this week 💪`
              : `Nobody's cleared week ${currentWeek} yet — be first`}
          </p>
        </div>
        {health !== null ? (
          <div className="text-right">
            <div className="display text-4xl leading-none tabular-nums text-clean-600">{health}%</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">squad health</div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto -mx-4 px-4">
        <div
          ref={grid}
          onContextMenu={(e) => e.preventDefault()}
          className="grid gap-[3px] items-center w-max min-w-full select-none"
          style={{ gridTemplateColumns: cols, WebkitTouchCallout: "none" }}
        >
          {/* Pulse: one bar per closed week, as tall as the share who kept it clean. */}
          <span className="text-[10px] text-ink-faint self-end pb-0.5">clean</span>
          {Array.from({ length: currentWeek }, (_, k) => {
            const p = pulse[k];
            const share = p && p.judged ? p.clean / p.judged : 0;
            return (
              <div key={k} className="h-12 flex flex-col justify-end items-center" title={p ? `Week ${p.week}: ${p.clean} of ${p.judged} clean` : `Week ${k + 1}: in progress`}>
                {p ? (
                  <>
                    <span className="text-[9px] tabular-nums text-ink-muted leading-none mb-0.5">{p.clean}</span>
                    <span
                      className="w-full rounded-t-[3px] bg-clean-500/70"
                      style={{ height: `${Math.max(4, share * 36)}px` }}
                    />
                  </>
                ) : (
                  <span className="text-[9px] text-ink-faint leading-none mb-0.5">now</span>
                )}
              </div>
            );
          })}
          <span />

          {ranked.map((r) => {
            const me = r.userId === currentUserId;
            const outcomes = new Map(r.weeks.map((w) => [w.week, w.outcome]));
            const runs = cleanRun(r.weeks);
            const { credits, needed } = r.currentWeekProgress;
            const progress = needed ? Math.min(1, credits / needed) : 0;
            const square = (week: number, label: string, look: string, fill?: React.ReactNode) => {
              const on = peek?.userId === r.userId && peek.week === week;
              return (
                <button
                  key={week}
                  type="button"
                  data-peek
                  data-user={r.userId}
                  data-week={week}
                  aria-label={label}
                  aria-expanded={on}
                  onClick={(e) => {
                    // A hold already opened this square; its release is not a tap.
                    if (Date.now() > heldUntil.current) show(e.currentTarget, true);
                  }}
                  className={`relative block aspect-square rounded-[4px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${look} ${
                    on ? "ring-2 ring-ink" : me ? "ring-1 ring-ink/20" : ""
                  }`}
                >
                  {fill}
                </button>
              );
            };
            return (
              <React.Fragment key={r.userId}>
                <span className={`truncate text-sm pr-2 ${me ? "font-semibold text-ink" : "text-ink-muted"}`}>
                  <span aria-hidden="true" className="mr-1">{r.avatar || r.name.charAt(0).toUpperCase()}</span>
                  {me ? "You" : r.name}
                </span>
                {Array.from({ length: currentWeek }, (_, k) => {
                  const week = k + 1;
                  if (week === currentWeek) {
                    return square(
                      week,
                      `${r.name}, week ${week}: ${credits} of ${needed}`,
                      "border border-dashed border-clean-500 overflow-hidden",
                      <span
                        className={`absolute inset-x-0 bottom-0 transition-[height,background-color] duration-500 ${
                          isWeekClean(r.currentWeekProgress) ? heatClass(liveStreak(r)) : "bg-clean-500"
                        }`}
                        style={{ height: `${progress * 100}%` }}
                      />
                    );
                  }
                  const outcome = outcomes.get(week);
                  return square(
                    week,
                    `${r.name}, week ${week}: ${outcome ?? "not in yet"}`,
                    outcome === "clean" ? heatClass(runs.get(week) ?? 1) : outcome ? CELL[outcome] : "bg-paper-sunk/50"
                  );
                })}
                <span className="text-right">
                  <Streak row={r} />
                </span>
              </React.Fragment>
            );
          })}

          <span />
          {Array.from({ length: currentWeek }, (_, k) => (
            <span key={k} className="text-center text-[9px] text-ink-faint tabular-nums">
              {(k + 1) % 2 === 1 || k + 1 === currentWeek ? k + 1 : ""}
            </span>
          ))}
          <span />
        </div>
      </div>

      {peek && peekRow && peekInfo ? (
        <div
          // A fresh element per square, so nothing from the last one is painted over.
          key={`${peek.userId}-${peek.week}`}
          data-peek
          role="status"
          className="absolute z-30 rounded-xl border border-line bg-paper-card shadow-xl p-3 pointer-events-none"
          style={{ left: peek.left, top: peek.top, width: PEEK_W, transform: "translateY(-100%)" }}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span className="truncate">
              <span aria-hidden="true" className="mr-1">{peekRow.avatar || peekRow.name.charAt(0).toUpperCase()}</span>
              {peekRow.userId === currentUserId ? "You" : peekRow.name}
            </span>
            <span className="shrink-0">{peekInfo.title}</span>
          </div>
          <div className={`display text-2xl leading-tight mt-1 ${TONE[peekInfo.tone]}`}>{peekInfo.status}</div>
          <div className="text-[12px] text-ink-muted">{peekInfo.detail}</div>
          {peekRow.weeks.some((w) => w.week === peek.week) || peek.week === currentWeek ? (
            <div className="mt-2">
              <WeekStrip
                days={weekDays(workoutDays, peekRow.userId, peek.week)}
                who={`${peekRow.name}'s days in week ${peek.week}`}
                today={peek.week === currentWeek ? todayIndex() : undefined}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="flex gap-px" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-l-[3px] bg-clean-500" />
            <span className="w-2.5 h-2.5 bg-clean-600" />
            <span className="w-2.5 h-2.5 rounded-r-[3px] bg-clean-700" />
          </span>
          clean — deeper in a row
        </span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-owed-500/80" />fined</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-ink-faint/30" />away</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] border border-dashed border-clean-500" />this week</span>
        <span>tap a square, or hold and drag</span>
      </div>
    </section>
  );
};

export default SquadWall;
