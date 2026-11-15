import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Footprints,
  IndianRupee,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { User, WorkoutDay, WorkoutKind } from "../types";
import { apiFetch, isAdmin } from "../services/http";
import { todayIndex } from "../utils/today";
import { celebrate } from "../utils/confetti";
import { Rupees } from "../utils/countUp";
import { useToast } from "./ToastContext";
import SquadWall from "./SquadWall";
import GroupSummary from "./GroupSummary";
import YourSeasonGrid from "./YourSeasonGrid";
import {
  CREDIT_BY_KIND,
  PAYMENT_GRACE_HOURS,
  SEASON_WEEKS,
  WEEKS_EDITABLE_BACK,
  WEEK_ENDS_ON,
  WEEKS_TO_MOVE,
} from "../utils/seasonEngine";

/**
 * The home screen, written for one person: your week first, your money second,
 * the group after that. Everything shown here is derived by the server from the
 * workout sheet — this screen only reports what the rules already decided.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Credit reads as 3 or 3½ — never 3.0. */
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Tapping a day walks it round: nothing → a session → 10k steps → nothing. */
const NEXT_KIND: Record<string, WorkoutKind | null> = {
  none: "session",
  session: "steps",
  steps: null,
};

interface UnsettledFine {
  id: string;
  week: number;
  amount: number;
  dueAt: string;
  overdue: boolean;
}

interface SeasonView {
  userId: string;
  name: string;
  avatar?: string | null;
  /** Left the season: off the board, their paid fines stay in the pot. */
  hasLeft?: boolean;
  /** The running week, Monday first. null is a day with nothing logged. */
  days?: (WorkoutKind | null)[];
  currentWeek: number;
  priceLevel: number;
  fineIfMissed: number;
  cleanWeeks: number;
  missedWeeks: number;
  cleanStreak: number;
  missesAtLevel: number;
  billed: number;
  paid: number;
  outstanding: number;
  potEligible: boolean;
  weeks: { week: number; outcome: "clean" | "missed" | "excused"; credits: number; fine: number }[];
  currentWeekProgress: { week: number; credits: number; needed: number };
  unsettledFines: UnsettledFine[];
}

interface MySeasonProps {
  currentUser: User | null;
  workoutDays: WorkoutDay[];
  onUpdateWorkoutDay: (day: WorkoutDay) => Promise<boolean>;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * How deep into an unbroken clean run each week sits.
 *
 * A run is the thing the rules actually reward — two in a row halves what a
 * miss costs — and the strip gave every clean week the same green, so four
 * scattered weeks looked exactly like four in a row. An excused week carries a
 * run across without extending it: that is the rule, it neither breaks a clean
 * streak nor builds one.
 */
export const cleanRun = (weeks: { outcome: string }[]): number[] => {
  let run = 0;
  return weeks.map((w) => {
    if (w.outcome === "missed") {
      run = 0;
      return 0;
    }
    if (w.outcome === "excused") return 0;
    run += 1;
    return run;
  });
};


/**
 * Seven days of one week, tappable.
 *
 * The running week and a correction to an earlier one are the same act, so they
 * are the same component. Drawn twice they drift, which is how this codebase has
 * produced three bugs already: a marker that only one copy had, a header that
 * disagreed with the row beneath it, a secret only one HTTP layer sent.
 */
const DayGrid: React.FC<{
  week: number;
  userId: string;
  workoutDays: WorkoutDay[];
  /** Only the week actually running marks today and reads days ahead as plans. */
  live: boolean;
  onCycle: (dayOfWeek: number, week: number) => void;
  /** Taps the server has not confirmed yet, keyed `week:dayOfWeek`. */
  pending: Record<string, WorkoutKind | null>;
}> = ({ week, userId, workoutDays, live, onCycle, pending }) => (
  <div className="grid grid-cols-7 gap-1.5">
    {DAYS.map((label, i) => {
      const dow = i + 1;
      const key = `${week}:${dow}`;
      const isToday = live && i === todayIndex();
      // Days ahead are tappable: planning the week is how the group uses them.
      // They are only worded as plans, not as done.
      const isFuture = live && i > todayIndex();
      const row = workoutDays.find(
        (w) => w.userId === userId && w.week === week && w.dayOfWeek === dow && w.isCompleted
      );
      // What the tap asked for wins until the server has answered. Before this
      // the cell sat unchanged for the whole round trip, so people tapped again
      // — and the second tap is not a retry, it is the next state.
      const stored = row ? row.kind ?? "session" : null;
      const kind = key in pending ? pending[key] : stored;
      const worth = kind ? CREDIT_BY_KIND[kind] : 0;
      return (
        <button
          key={label}
          data-day={key}
          onClick={() => onCycle(dow, week)}
          aria-pressed={Boolean(kind)}
          aria-label={`${label}${isToday ? ", today" : isFuture ? ", ahead" : ""}: ${
            kind === "session"
              ? "workout logged, tap for 10k steps"
              : kind === "steps"
                ? "10k steps logged — half a workout, tap to clear"
                : "nothing logged, tap for a workout"
          }`}
          /* Today is ringed inside the button: these sit in a grid whose first
             and last columns are flush with the page, where an outside ring
             loses an edge. */
          className={`min-h-[56px] rounded-xl border text-xs font-semibold cursor-pointer
            cell-press active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
            ${isToday ? "ring-2 ring-inset ring-ink" : ""}
            ${
              kind === "session"
                ? "bg-clean-500 border-clean-500 text-paper"
                : kind === "steps"
                  ? "bg-clean-100 border-clean-500 text-clean-700"
                  : "bg-paper-card border-line text-ink-muted hover:border-clean-500 hover:text-clean-600"
            }`}
        >
          <span
            /* Prefixed: the icon beside it is keyed on the kind too, and two
               siblings sharing a key made React stack a fresh label per tap. */
            key={`label-${kind ?? "none"}`}
            className={`block animate-settle-up ${isToday && !kind ? "text-ink" : ""}`}
          >
            {label}
          </span>
          {/* Keyed on the kind so React remounts the icon, and the pop plays
              on every change rather than only the first. Late by design: the
              cell has to have moved before its icon arrives, or the press reads
              as a side effect of the icon instead of the cause of it. */}
          {kind === "session" ? (
            <Check key="icon-session" size={14} className="mx-auto mt-1 animate-pop-late" aria-hidden="true" />
          ) : kind === "steps" ? (
            <Footprints key="icon-steps" size={14} className="mx-auto mt-1 animate-pop-late" aria-hidden="true" />
          ) : null}
          {kind ? <span className="sr-only">worth {worth} of a workout</span> : null}
        </button>
      );
    })}
  </div>
);

/**
 * The credit a tap is already showing that the server has not confirmed.
 *
 * The grid paints a tap at once; the count beside it was read straight off the
 * season the server last sent, so for the length of a round trip the cells and
 * the number disagreed — five filled cells over the words "2 more workouts this
 * week".
 *
 * A pending tap stops counting the moment the stored row agrees with it. That
 * guard is the whole reason this is a function worth testing: the reload that
 * confirms a tap and the clearing of that tap are two state changes, and in the
 * render between them the credit would otherwise be counted twice — a week that
 * reads clean on four workouts and a burst of confetti nobody earned.
 */
export const pendingCredit = (
  pending: Record<string, WorkoutKind | null>,
  workoutDays: WorkoutDay[],
  userId: string,
  liveWeek: number
): number =>
  Object.entries(pending).reduce((sum, [key, next]) => {
    const [week, dayOfWeek] = key.split(":").map(Number);
    if (week !== liveWeek) return sum;
    const row = workoutDays.find(
      (w) => w.userId === userId && w.week === week && w.dayOfWeek === dayOfWeek && w.isCompleted
    );
    const stored = row ? row.kind ?? "session" : null;
    if (stored === next) return sum;
    return sum + (next ? CREDIT_BY_KIND[next] : 0) - (stored ? CREDIT_BY_KIND[stored] : 0);
  }, 0);

/**
 * What the app should be telling this player right now.
 *
 * The numbers were always there — how many workouts are left, how many days are
 * left, what a miss costs. Nobody was being told.
 */
const nudgeFor = (
  done: number,
  needed: number,
  daysLeft: number,
  fine: number,
  outstanding: number,
  overdue = false
): { tone: "owed" | "skip" | "clean"; text: string } | null => {
  if (outstanding > 0) {
    return {
      tone: "owed",
      // Past the deadline the season takes nothing away — that is the rule, and
      // saying so matters, because a player who thinks they are locked out
      // stops logging and turns one fine into a run of them. What is actually
      // at stake is the pot, and the fact that it is no longer private.
      text: overdue
        ? `${rupees(outstanding)} is past its ${PAYMENT_GRACE_HOURS} hours. You can still log your workouts — nothing is taken away. What it costs is your share of the pot, and the group can see it on the board now.`
        : `${rupees(outstanding)} is due. Settle it with whoever runs the season — nothing outstanding is what keeps you in for the pot.`,
    };
  }

  const left = needed - done;
  if (left <= 0) {
    return {
      tone: "clean",
      text: `This week is clean. ${WEEKS_TO_MOVE} in a row and the price of a miss halves.`,
    };
  }
  if (left > daysLeft) {
    return {
      tone: "owed",
      text: `${left} workouts left and only ${daysLeft} day${daysLeft === 1 ? "" : "s"} to do them. This week costs ${rupees(fine)}.`,
    };
  }
  if (left === daysLeft) {
    return {
      tone: "skip",
      text: `${left} left, ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go — every remaining day counts, or it's ${rupees(fine)}.`,
    };
  }
  return null;
};

const MySeason: React.FC<MySeasonProps> = ({
  currentUser,
  workoutDays,
  onUpdateWorkoutDay,
}) => {
  const [players, setPlayers] = useState<SeasonView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Recording a payment is the admin's job — the server refuses it from anyone else.
  const admin = isAdmin();
  const { showToast } = useToast();
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  /**
   * Taps the server has not answered yet, keyed `week:dayOfWeek`.
   *
   * The cell paints from this the instant it is tapped and clears when the
   * reload lands. Without it the screen sat still for the whole round trip —
   * on a phone, in a gym, that reads as a dropped tap, and the retry was not a
   * retry: it advanced the cycle and quietly turned a workout into half of one.
   */
  const [pending, setPending] = useState<Record<string, WorkoutKind | null>>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`/seasons`);
      if (!res.ok) throw new Error(`Could not load players (${res.status})`);
      const seasons = await res.json();
      setPlayers(seasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the person changes, and when their name does: this screen holds
  // its own copy of the season, so a rename on the card above it would otherwise
  // sit next to the old name until the tab was left and come back to.
  useEffect(() => {
    load();
  }, [load, currentUser?.id, currentUser?.name, currentUser?.avatar]);

  const me = useMemo(
    () => players.find((p) => p.userId === currentUser?.id) ?? null,
    [players, currentUser]
  );
  const editableWeeks = useMemo(() => {
    if (!me) return [];
    // A fined week whose fine is not in the unsettled list has been paid, and
    // the server will not let a player rewrite it: voiding a settled fine takes
    // money that actually changed hands back out of the pot.
    const unsettled = new Set(me.unsettledFines.map((f) => f.week));
    // Newest first: the week just gone is the one people come here for.
    return [...me.weeks]
      .filter((w) => me.currentWeekProgress.week - w.week <= WEEKS_EDITABLE_BACK)
      .sort((a, b) => b.week - a.week)
      .map((w) => ({ ...w, settled: w.fine > 0 && !unsettled.has(w.week) }));
  }, [me]);

  const call = async (path: string, body?: object) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(data.error ?? "That didn't work");
      await load();
      return res.ok;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Walk a day round the cycle: nothing → a session → 10k steps → nothing.
   * Your sheet only, and only the running week.
   */
  const cycleDay = async (dayOfWeek: number, week: number) => {
    if (!currentUser || !me) return;
    const key = `${week}:${dayOfWeek}`;
    // A second tap while the first is still in the air is someone asking "did
    // that land?", not asking for the next state. Answer it by doing nothing.
    if (key in pending) return;

    const existing = workoutDays.find(
      (w) => w.userId === currentUser.id && w.week === week && w.dayOfWeek === dayOfWeek
    );
    const current = existing?.isCompleted ? existing.kind ?? "session" : "none";
    const next = NEXT_KIND[current];

    // Paint it now. The server is the authority, but it is not the audience.
    setPending((p) => ({ ...p, [key]: next }));

    const live = week === me.currentWeekProgress.week;
    const before = me.currentWeekProgress.credits;
    const after = before - (current === "none" ? 0 : CREDIT_BY_KIND[current]) + (next ? CREDIT_BY_KIND[next] : 0);
    const justWentClean = live && before < me.currentWeekProgress.needed && after >= me.currentWeekProgress.needed;

    const saved = await onUpdateWorkoutDay({
      id: existing?.id || `workout-${currentUser.id}-${week}-${dayOfWeek}-${Date.now()}`,
      userId: currentUser.id,
      week,
      dayOfWeek,
      date: new Date().toISOString().split("T")[0],
      isCompleted: next !== null,
      kind: next ?? existing?.kind ?? "session",
      workoutType: existing?.workoutType ?? "gym",
      notes: existing?.notes,
      markedBy: "user",
      timestamp: new Date().toISOString(),
    });

    // Only on the way in, and only once the server has it. Clearing a day is a
    // correction, not an achievement; and cheering a write that never landed —
    // offline, or refused — put "Good job!" on screen beside the error saying
    // nothing had been saved.
    if (!saved) {
      // Nothing was written, so nothing should look written.
      setPending((p) => {
        const { [key]: _dropped, ...rest } = p;
        return rest;
      });
      return;
    }

    if (next) {
      // A day ahead is a plan, not a result — cheering it as done would be the
      // app claiming training that has not happened.
      const planned = live && dayOfWeek > todayIndex() + 1;
      showToast(
        !live
          ? `Week ${week} updated. The season has re-scored it.`
          : justWentClean
          ? `That's the week. ${currentUser.name} is clean — ${WEEKS_TO_MOVE} in a row halves the price.`
          : planned
          ? `${currentUser.name} is down for ${DAYS[dayOfWeek - 1]}. Hold yourself to it.`
          : `${currentUser.name} ${next === "steps" ? "walked it" : "done"}! Good job!`,
        "success"
      );
    }

    // The only thing this app asks of anyone, done. Fired from the cell that
    // finished it, so the burst comes out of the tap.
    if (justWentClean) {
      const cell = document.querySelector(`[data-day="${key}"]`)?.getBoundingClientRect();
      celebrate(cell ? { x: cell.left + cell.width / 2, y: cell.top + cell.height / 2 } : undefined);
    }

    // The server re-derives fines from the sheet, so the whole season is reread
    // rather than patched. The optimistic paint holds until it lands.
    await load();
    setPending((p) => {
      const { [key]: _done, ...rest } = p;
      return rest;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your season">
        <div className="h-56 rounded-2xl bg-line-soft animate-pulse" />
        <div className="h-32 rounded-2xl bg-line-soft animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-owed-50 border border-owed-100 rounded-2xl p-5 text-owed-700">
        <p className="font-semibold mb-1">Couldn't load your season</p>
        <p className="text-sm text-ink-muted">
          Something went wrong reaching the season. Try again in a moment.
        </p>
        <button onClick={load} className="mt-4 min-h-[44px] px-4 bg-owed-500 text-paper rounded-xl text-sm font-semibold">
          Retry
        </button>
      </div>
    );
  }

  // 1 = Monday … 7 = Sunday. One week shape for the whole group.
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;
  const daysLeft = Math.max(0, WEEK_ENDS_ON - todayDow + 1);
  const done = Math.max(
    0,
    (me?.currentWeekProgress.credits ?? 0) +
      (me && currentUser
        ? pendingCredit(pending, workoutDays, currentUser.id, me.currentWeekProgress.week)
        : 0)
  );
  const needed = me?.currentWeekProgress.needed ?? 5;
  const left = Math.max(0, needed - done);

  return (
    <div className="space-y-5">
      {notice ? (
        <div role="status" className="text-sm border border-line bg-paper-card rounded-xl px-4 py-3 text-ink">
          {notice}
        </div>
      ) : null}

      {me ? (
        <section className="overflow-hidden">
          <div className="pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Week {me.currentWeek} of {SEASON_WEEKS}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="display text-3xl">{me.name}</h2>
                  {me.potEligible ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-clean-600">
                      <Trophy size={13} aria-hidden="true" /> in for the pot
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  A miss costs
                </p>
                <p className="display text-3xl tnum text-ink">{rupees(me.fineIfMissed)}</p>
              </div>
            </div>


            {me
              ? (() => {
                  const nudge = nudgeFor(
                    done,
                    needed,
                    daysLeft,
                    me.fineIfMissed,
                    me.outstanding,
                    me.unsettledFines.some((f) => f.overdue)
                  );
                  if (!nudge) return null;
                  const tone = {
                    owed: "bg-owed-50 border-owed-100 text-owed-700",
                    skip: "bg-skip-50 border-skip-100 text-skip-700",
                    clean: "bg-clean-50 border-clean-100 text-clean-700",
                  }[nudge.tone];
                  return (
                    <p
                      role="status"
                      className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${tone}`}
                    >
                      {nudge.text}
                    </p>
                  );
                })()
              : null}

            {/* This week, and the only thing to do about it. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-semibold text-ink">
                  {left === 0
                    ? "This week is clean"
                    : `${credit(left)} more workout${left === 1 ? "" : "s"} this week`}
                </p>
                <p className="text-sm tnum text-ink-muted">
                  {/* Keyed on the credit so it bumps when the number changes,
                      a beat behind the cell that changed it. */}
                  <span key={done} className="animate-bump">
                    {credit(done)}
                  </span>
                  /{needed}
                </p>
              </div>

              <DayGrid
                week={me.currentWeekProgress.week}
                userId={me.userId}
                workoutDays={workoutDays}
                live
                onCycle={cycleDay}
                pending={pending}
              />
            </div>
          </div>

          {/* Logging first, then the group, then you — the dashboard's order. */}
          <div className="pt-8 pb-8 border-t border-line space-y-8">
            {/* Every row, leavers too: what they paid is still in the pot. */}
            <GroupSummary rows={players} />
            <SquadWall
              rows={players.filter((p) => !p.hasLeft)}
              currentWeek={me.currentWeekProgress.week}
              currentUserId={me.userId}
            />
          </div>

          <div className="pt-8 pb-6 border-t border-line">
            <YourSeasonGrid row={me} workoutDays={workoutDays} currentWeek={me.currentWeekProgress.week} />
          </div>

          {/* The numbers a player actually tracks. */}
          <dl className="grid grid-cols-3 border-t border-line sm:divide-x divide-line">
            <div className="py-4 pr-4 sm:px-4 sm:first:pl-0 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Clean weeks</dt>
              <dd className="display text-2xl tnum mt-0.5 text-clean-600">{me.cleanWeeks}</dd>
            </div>
            <div className="py-4 pr-4 sm:px-4 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Paid in</dt>
              <dd className="display text-2xl tnum mt-0.5 text-ink">
                <Rupees value={me.paid} />
              </dd>
            </div>
            <div className="py-4 pr-4 sm:px-4 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Fined weeks</dt>
              <dd className="display text-2xl tnum mt-0.5 text-owed-600">{me.missedWeeks}</dd>
            </div>
          </dl>

          {/*
            Correcting a week that has closed. The same grid as the running
            week, because it is the same act — the season re-scores the week on
            every tap, so a miss that becomes clean stops being billed there and
            then, and a week that stops being clean starts being billed.
          */}
          {editableWeeks.length > 0 ? (
            <div className="pt-5 border-t border-line mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Fix an earlier week
                </p>
                <select
                  value={editingWeek ?? ""}
                  onChange={(e) => setEditingWeek(e.target.value ? Number(e.target.value) : null)}
                  aria-label="Which week to correct"
                  className="min-h-[40px] px-2 border border-line rounded-lg bg-paper-card text-sm
                             font-semibold text-ink cursor-pointer focus:ring-2 focus:ring-clean-500"
                >
                  <option value="">Choose a week…</option>
                  {editableWeeks.map((w) => (
                    <option key={w.week} value={w.week} disabled={w.settled}>
                      Week {w.week} — {credit(w.credits)}/{needed} {w.outcome}
                      {w.fine ? ` · ${rupees(w.fine)}` : ""}
                      {w.settled ? " · paid, locked" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {editingWeek ? (
                <>
                  <DayGrid
                    week={editingWeek}
                    userId={me.userId}
                    workoutDays={workoutDays}
                    live={false}
                    onCycle={cycleDay}
                    pending={pending}
                  />
                  <p className="text-xs text-ink-muted mt-2">
                    Log what you actually did. The week is scored again as you tap, and any
                    fine for it follows — this is the record everyone else reads.
                  </p>
                  {editableWeeks.some((w) => w.settled) ? (
                    <p className="text-xs text-ink-faint mt-1">
                      Weeks you have already paid for are locked. Ask whoever runs the season
                      to change one — the money has moved.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-ink-muted">
                  Forgot to log something? Pick the week and put it right.
                </p>
              )}
            </div>
          ) : null}

          {/* Money you owe. Paying happens between people; only the admin records it. */}
          {me.unsettledFines.length > 0 ? (
            <ul className="border-t border-line pt-4 mt-5 space-y-1.5">
              {me.unsettledFines.map((f) => (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    f.overdue ? "bg-owed-50 border-owed-100" : "bg-paper-sunk border-line"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    {f.overdue ? (
                      <AlertTriangle size={15} className="text-owed-500" aria-hidden="true" />
                    ) : (
                      <IndianRupee size={15} className="text-skip-500" aria-hidden="true" />
                    )}
                    <span className="font-semibold tnum text-ink">
                      Week {f.week} — {rupees(f.amount)}
                    </span>
                    <span className={f.overdue ? "text-owed-600" : "text-ink-muted"}>
                      {f.overdue
                        ? `past its ${PAYMENT_GRACE_HOURS} hours`
                        : `due within ${PAYMENT_GRACE_HOURS} hours`}
                    </span>
                  </span>
                  {admin ? (
                    <button
                      onClick={() => call(`/fines/${f.id}/settle`)}
                      disabled={busy}
                      className="min-h-[44px] px-4 bg-ink text-paper rounded-lg text-xs font-semibold cursor-pointer
                                 disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      Mark paid
                    </button>
                  ) : (
                    <span className="text-xs text-ink-muted">
                      Pay it directly — whoever runs the season marks it paid.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-line pt-4 mt-5">
              <span className="flex items-center gap-2 text-sm text-clean-600">
                <ShieldCheck size={15} aria-hidden="true" /> Nothing outstanding
              </span>
            </div>
          )}
        </section>
      ) : null}


    </div>
  );
};

export default MySeason;