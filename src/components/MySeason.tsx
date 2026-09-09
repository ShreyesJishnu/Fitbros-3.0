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
import {
  CREDIT_BY_KIND,
  PAYMENT_GRACE_HOURS,
  SEASON_WEEKS,
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
  overdue: boolean;
}

interface SeasonView {
  userId: string;
  name: string;
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
  weeks: { week: number; outcome: "clean" | "missed"; credits: number; fine: number }[];
  currentWeekProgress: { week: number; credits: number; needed: number };
  unsettledFines: UnsettledFine[];
}

interface MySeasonProps {
  currentUser: User | null;
  workoutDays: WorkoutDay[];
  onUpdateWorkoutDay: (day: WorkoutDay) => void;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const OUTCOME_STYLE = {
  clean: "bg-clean-500",
  missed: "bg-owed-500",
} as const;

const OUTCOME_LABEL = { clean: "Clean", missed: "Fined" } as const;

/** The season so far, plus the week still running, as one strip. */
const WeekStrip: React.FC<{ view: SeasonView }> = ({ view }) => (
  <div className="flex gap-1" role="list" aria-label={`${view.name}'s weeks`}>
    {view.weeks.map((w) => (
      <div
        key={w.week}
        role="listitem"
        title={`Week ${w.week}: ${credit(w.credits)} workouts — ${OUTCOME_LABEL[w.outcome]}${
          w.fine ? ` (${rupees(w.fine)})` : ""
        }`}
        className={`flex-1 rounded-md h-8 ${OUTCOME_STYLE[w.outcome]}`}
      />
    ))}
    {/* The current week is still open, so it reads as an outline, not a verdict. */}
    <div
      role="listitem"
      title={`Week ${view.currentWeekProgress.week}: ${credit(view.currentWeekProgress.credits)} of ${view.currentWeekProgress.needed} so far — still running`}
      className="flex-1 rounded-md border-2 border-dashed border-ink-faint relative overflow-hidden h-8"
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-clean-500/40"
        style={{
          height: `${Math.min(100, (view.currentWeekProgress.credits / view.currentWeekProgress.needed) * 100)}%`,
        }}
      />
    </div>
  </div>
);


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
  outstanding: number
): { tone: "owed" | "skip" | "clean"; text: string } | null => {
  if (outstanding > 0) {
    return {
      tone: "owed",
      text: `${rupees(outstanding)} is due. Settle it with whoever runs the season — nothing outstanding is what keeps you in for the pot.`,
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

  useEffect(() => {
    load();
  }, [load]);

  const me = useMemo(
    () => players.find((p) => p.userId === currentUser?.id) ?? null,
    [players, currentUser]
  );
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
  const cycleDay = (dayOfWeek: number) => {
    if (!currentUser || !me) return;
    const week = me.currentWeekProgress.week;
    const existing = workoutDays.find(
      (w) => w.userId === currentUser.id && w.week === week && w.dayOfWeek === dayOfWeek
    );
    const current = existing?.isCompleted ? existing.kind ?? "session" : "none";
    const next = NEXT_KIND[current];

    onUpdateWorkoutDay({
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

    // The server re-derives fines from the sheet.
    setTimeout(load, 400);
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
  const done = me?.currentWeekProgress.credits ?? 0;
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
                  const nudge = nudgeFor(done, needed, daysLeft, me.fineIfMissed, me.outstanding);
                  if (!nudge) return null;
                  const tone = {
                    owed: "bg-owed-50 text-owed-700",
                    skip: "bg-skip-50 text-skip-700",
                    clean: "bg-clean-50 text-clean-700",
                  }[nudge.tone];
                  return (
                    <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${tone}`}>
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
                  {credit(done)}/{needed}
                </p>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((label, i) => {
                  const dow = i + 1;
                  const row = workoutDays.find(
                    (w) =>
                      w.userId === me.userId &&
                      w.week === me.currentWeekProgress.week &&
                      w.dayOfWeek === dow &&
                      w.isCompleted
                  );
                  const kind = row ? row.kind ?? "session" : null;
                  const worth = kind ? CREDIT_BY_KIND[kind] : 0;
                  return (
                    <button
                      key={label}
                      onClick={() => cycleDay(dow)}
                      aria-pressed={Boolean(kind)}
                      aria-label={`${label}: ${
                        kind === "session"
                          ? "workout logged, tap for 10k steps"
                          : kind === "steps"
                            ? "10k steps logged — half a workout, tap to clear"
                            : "nothing logged, tap for a workout"
                      }`}
                      className={`min-h-[56px] rounded-xl border text-xs font-semibold cursor-pointer
                        transition-colors duration-150 ease-settle disabled:opacity-40 disabled:cursor-not-allowed
                        ${
                          kind === "session"
                            ? "bg-clean-500 border-clean-500 text-paper"
                            : kind === "steps"
                              ? "bg-clean-100 border-clean-500 text-clean-700"
                              : "bg-paper-card border-line text-ink-muted hover:border-clean-500 hover:text-clean-600"
                        }`}
                    >
                      <span className="block">{label}</span>
                      {kind === "session" ? (
                        <Check size={14} className="mx-auto mt-1" aria-hidden="true" />
                      ) : kind === "steps" ? (
                        <Footprints size={14} className="mx-auto mt-1" aria-hidden="true" />
                      ) : null}
                      {kind ? (
                        <span className="sr-only">worth {worth} of a workout</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* The numbers a player actually tracks. */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 border-t border-line sm:divide-x divide-line">
            <div className="py-4 pr-4 sm:px-4 sm:first:pl-0 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Clean weeks</dt>
              <dd className="display text-2xl tnum mt-0.5 text-clean-600">{me.cleanWeeks}</dd>
            </div>
            <div className="py-4 pr-4 sm:px-4 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Streak</dt>
              <dd className="display text-2xl tnum mt-0.5 text-ink">{me.cleanStreak}</dd>
            </div>
            <div className="py-4 pr-4 sm:px-4 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Paid in</dt>
              <dd className="display text-2xl tnum mt-0.5 text-ink">{rupees(me.paid)}</dd>
            </div>
            <div className="py-4 pr-4 sm:px-4 border-b border-line">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Fined weeks</dt>
              <dd className="display text-2xl tnum mt-0.5 text-owed-600">{me.missedWeeks}</dd>
            </div>
          </dl>

          <div className="pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted mb-2">
              Your season
            </p>
            <WeekStrip view={me} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm bg-clean-500" aria-hidden="true" /> {me.cleanWeeks} clean
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm bg-owed-500" aria-hidden="true" /> {me.missedWeeks} fined
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm border-2 border-dashed border-ink-faint" aria-hidden="true" /> this week
              </span>
            </div>
          </div>

          {/* Money you owe. Paying happens between people; only the admin records it. */}
          {me.unsettledFines.length > 0 ? (
            <ul className="border-t border-line pt-4 mt-5 space-y-1.5">
              {me.unsettledFines.map((f) => (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                    f.overdue ? "bg-owed-50" : "bg-paper-sunk"
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