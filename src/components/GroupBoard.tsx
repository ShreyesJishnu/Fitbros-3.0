import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Share2, Trophy } from "lucide-react";
import { Goal, User, WorkoutKind } from "../types";
import Feed from "./Feed";
import PlayerSheet from "./PlayerSheet";
import GroupStats from "./GroupStats";
import { shareCard } from "../utils/shareCard";
import { apiFetch } from "../services/http";
import { SEASON_WEEKS } from "../utils/seasonEngine";

/**
 * The group, at group scale: who is where, what the season has cost everyone,
 * and where the pot is heading.
 *
 * Deliberately has no day-by-day logging. Logging is a personal act and lives on
 * My season; repeating it here only gave two places to read the same thing.
 */


export interface GroupRow {
  userId: string;
  name: string;
  currentWeek: number;
  fineIfMissed: number;
  cleanWeeks: number;
  missedWeeks: number;
  cleanStreak: number;
  billed: number;
  paid: number;
  outstanding: number;
  potEligible: boolean;
  weeks: { week: number; outcome: "clean" | "missed"; credits: number; fine: number }[];
  currentWeekProgress: { week: number; credits: number; needed: number };
  /** The running week, Monday first. null is a day with nothing logged. */
  days: (WorkoutKind | null)[];
  /** When they last opened the app. null means they never have. */
  lastSeenAt: string | null;
}

interface GroupBoardProps {
  currentUser: User | null;
  /** App already holds every goal; the statistics block should not fetch them again. */
  goals: Goal[];
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Credit reads as 3 or 3.5, never 3.0. */
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const OUTCOME_STYLE = {
  clean: "bg-clean-500",
  missed: "bg-owed-500",
} as const;

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * The same two fills My season uses for a logged day, so a session means the
 * same thing on both screens.
 */
const DAY_STYLE: Record<WorkoutKind, string> = {
  session: "bg-clean-500 border-clean-500",
  // A bare block has no label to lean on the way My season's buttons do, so the
  // half a workout is carried by a heavier edge, not by the fill alone.
  steps: "bg-clean-100 border-2 border-clean-500",
};

const DAY_LABEL: Record<WorkoutKind, string> = { session: "a workout", steps: "10k steps" };

/**
 * Today, from the device — Monday is 1.
 *
 * The server does not answer this. It holds no timezone, and the engine refuses
 * to derive the week from a date; the phone reading the screen is already in
 * the right place.
 */
export const todayIndex = (date: Date = new Date()): number => (date.getDay() + 6) % 7;

/** The week so far, day by day. Reads as a claim, not a clock: a day can be filled in late. */
const DayStrip: React.FC<{ row: GroupRow }> = ({ row }) => {
  const today = todayIndex();
  return (
    <div className="flex gap-1" role="list" aria-label={`${row.name}, this week`}>
      {row.days.map((kind, i) => (
        <div
          key={i}
          role="listitem"
          title={`${DAY_NAMES[i]}: ${kind ? DAY_LABEL[kind] : "nothing logged"}`}
          aria-label={`${DAY_NAMES[i]}: ${kind ? DAY_LABEL[kind] : "nothing logged"}`}
          className={`h-6 flex-1 rounded-md border ${
            kind ? DAY_STYLE[kind] : "bg-paper-card border-line"
          } ${i === today ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""}`}
        />
      ))}
    </div>
  );
};

/**
 * What the group actually wants to know, in words — colour alone never says it.
 * A player who has never opened the app is told apart from one who simply has
 * not trained, because the two need different conversations.
 */
/**
 * Anything logged, ever. A season that predates last_seen_at still proves the
 * person has the app — claiming otherwise would accuse the most diligent
 * players first, since they are the ones with a history.
 */
const hasBeenHere = (row: GroupRow): boolean =>
  Boolean(row.lastSeenAt) || row.days.some(Boolean) || row.weeks.some((w) => w.credits > 0);

export const todayLine = (row: GroupRow): { text: string; tone: string } => {
  if (!hasBeenHere(row)) return { text: "never opened the app", tone: "text-ink-muted" };
  const kind = row.days[todayIndex()];
  if (!kind) return { text: "not yet today", tone: "text-owed-600" };
  return { text: kind === "steps" ? "10k steps today" : "trained today", tone: "text-clean-600" };
};

const GroupBoard: React.FC<GroupBoardProps> = ({ currentUser, goals }) => {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`/seasons`);
      if (!res.ok) throw new Error(`Could not load players (${res.status})`);
      const seasons = await res.json();
      setRows(seasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Pot eligibility first, then who has kept the most weeks clean. Money owed
   * breaks a tie, because it is what stands between you and the pot.
   */
  const ranked = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.potEligible !== b.potEligible) return a.potEligible ? -1 : 1;
        if (a.cleanWeeks !== b.cleanWeeks) return b.cleanWeeks - a.cleanWeeks;
        return a.outstanding - b.outstanding;
      }),
    [rows]
  );

  const share = async () => {
    try {
      const result = await shareCard({
        week: rows[0]?.currentWeek ?? 1,
        seasonWeeks: SEASON_WEEKS,
        rows: ranked.map((r) => ({
          name: r.name,
          cleanWeeks: r.cleanWeeks,
          outstanding: r.outstanding,
          potEligible: r.potEligible,
        })),
        potCount: rows.filter((r) => r.potEligible).length,
        inPot: rows.reduce((sum, r) => sum + r.paid, 0),
        outstanding: rows.reduce((sum, r) => sum + r.outstanding, 0),
      });
      setShareNote(result === "shared" ? "Shared." : "Saved as a PNG — send it to the group.");
    } catch {
      setShareNote("Could not make the card");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the group">
        <div className="h-24 rounded-2xl bg-line-soft animate-pulse" />
        <div className="h-72 rounded-2xl bg-line-soft animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-owed-50 border border-owed-100 rounded-2xl p-5 text-owed-700">
        <p className="font-semibold mb-1">{error}</p>
        <button onClick={load} className="mt-4 min-h-[44px] px-4 bg-owed-500 text-paper rounded-xl text-sm font-semibold">
          Retry
        </button>
      </div>
    );
  }

  const potCount = rows.filter((r) => r.potEligible).length;
  const trainedToday = rows.filter((r) => r.days[todayIndex()]).length;
  const neverOpened = rows.filter((r) => !hasBeenHere(r));
  const owed = rows.reduce((sum, r) => sum + r.outstanding, 0);
  const paid = rows.reduce((sum, r) => sum + r.paid, 0);

  return (
    <div className="space-y-5">
      <header className="pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Week {rows[0]?.currentWeek ?? 1} of 24
            </p>
            <h2 className="display text-3xl mt-1">The group</h2>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={share}
            className="flex items-center gap-2 min-h-[44px] px-4 border border-line rounded-xl text-sm font-semibold
                       text-ink cursor-pointer transition-colors duration-150 ease-settle hover:border-ink"
          >
            <Share2 size={16} aria-hidden="true" />
            Share
          </button>
          </div>
        </div>

        {shareNote ? (
          <p role="status" className="text-sm text-ink-muted mt-3">
            {shareNote}
          </p>
        ) : null}

        <dl className="grid grid-cols-2 sm:grid-cols-4 mt-5 border-t border-line sm:divide-x divide-line">
          <div className="py-4 pr-4 sm:px-4 sm:first:pl-0 border-b border-line">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">In for the pot</dt>
            <dd className="display text-3xl mt-1 tnum text-clean-600">
              {potCount}
              <span className="text-ink-muted">/{rows.length}</span>
            </dd>
          </div>
          <div className="py-4 pr-4 sm:px-4 border-b border-line">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">In the pot</dt>
            <dd className="display text-3xl mt-1 tnum text-ink">{rupees(paid)}</dd>
          </div>
          <div className="py-4 pr-4 sm:px-4 border-b border-line">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Outstanding</dt>
            <dd className={`display text-3xl mt-1 tnum ${owed ? "text-owed-600" : "text-clean-600"}`}>
              {rupees(owed)}
            </dd>
          </div>
          <div className="py-4 pr-4 sm:px-4 border-b border-line">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Trained today
            </dt>
            <dd className="display text-3xl mt-1 tnum text-clean-600">
              {trainedToday}
              <span className="text-ink-muted">/{rows.length}</span>
            </dd>
          </div>
        </dl>

        {/* Only while it is still true. Once everyone is in, it stops existing. */}
        {neverOpened.length ? (
          <div className="mt-4 border border-owed-100 bg-owed-50 rounded-xl px-4 py-3">
            <p className="text-sm text-owed-700 font-semibold">
              {neverOpened.length} {neverOpened.length === 1 ? "has" : "have"} never opened the app
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {neverOpened.map((r) => r.name).join(", ")} — send them the link
            </p>
          </div>
        ) : null}
      </header>

      <section className="overflow-hidden">
        {/* A six-column table cannot survive 375px, so the phone gets rows. */}
        {/* One key for ten strips. Repeating it per row is noise. */}
        <div className="md:hidden flex gap-1 pb-1.5" aria-hidden="true">
          {DAYS.map((d, i) => (
            <span
              key={i}
              className={`flex-1 text-center text-[10px] uppercase tracking-[0.06em] ${
                i === todayIndex() ? "text-ink font-semibold" : "text-ink-faint"
              }`}
            >
              {d}
            </span>
          ))}
        </div>

        <ul className="md:hidden divide-y divide-line border-t border-line">
          {ranked.map((r) => {
            const isMe = r.userId === currentUser?.id;
            return (
              <li key={r.userId} className={isMe ? "bg-clean-50 -mx-5 px-5 sm:-mx-8 sm:px-8" : ""}>
                <button
                  onClick={() => setOpenPlayer(r.userId)}
                  className="w-full text-left py-4 cursor-pointer"
                  aria-label={`Open ${r.name}'s season`}
                >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-ink truncate">{r.name}</span>
                    {isMe ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] bg-clean-100 text-clean-700 px-1.5 py-0.5 rounded shrink-0">
                        You
                      </span>
                    ) : null}
                  </div>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className={`text-xs ${todayLine(r).tone}`}>{todayLine(r).text}</span>
                    {r.outstanding ? (
                      <span className="tnum font-semibold text-owed-600">{rupees(r.outstanding)}</span>
                    ) : null}
                  </span>
                </div>

                <div className="mt-2.5">
                  <DayStrip row={r} />
                </div>

                {/* Nothing to show before a week has closed. */}
                {r.weeks.length ? (
                  <div className="flex gap-0.5 mt-1.5" aria-label={`${r.cleanWeeks} clean weeks`}>
                    {r.weeks.map((w) => (
                      <div key={w.week} className={`h-2 flex-1 rounded-sm ${OUTCOME_STYLE[w.outcome]}`} />
                    ))}
                    <div className="h-2 flex-1 rounded-sm border border-dashed border-ink-faint" />
                  </div>
                ) : null}

                <p className="text-xs text-ink-muted mt-2 tnum">
                  {credit(r.currentWeekProgress.credits)} of {r.currentWeekProgress.needed} this
                  week · {r.cleanWeeks} clean · {rupees(r.fineIfMissed)} a miss
                </p>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 px-4 font-semibold text-ink">Player</th>
                <th className="py-3 px-4 font-semibold text-ink w-[22%]">This week</th>
                <th className="py-3 px-4 font-semibold text-ink w-[22%]">Season</th>
                <th className="py-3 px-3 font-semibold text-ink text-right">Clean</th>
                <th className="py-3 px-3 font-semibold text-ink text-right">A miss</th>
                <th className="py-3 px-3 font-semibold text-ink text-right">Paid</th>
                <th className="py-3 px-4 font-semibold text-ink text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const isMe = r.userId === currentUser?.id;
                return (
                  <tr
                    key={r.userId}
                    onClick={() => setOpenPlayer(r.userId)}
                    className={`border-b border-line-soft last:border-0 cursor-pointer transition-colors
                      duration-150 ease-settle hover:bg-paper-sunk ${isMe ? "bg-clean-50" : ""}`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">{r.name}</span>
                        {isMe ? (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] bg-clean-100 text-clean-700 px-1.5 py-0.5 rounded">
                            You
                          </span>
                        ) : null}
                        {r.potEligible ? (
                          <Trophy size={12} className="text-clean-600" aria-label="In for the pot" />
                        ) : null}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5 tnum">
                        {r.cleanStreak} week streak · {r.missedWeeks} fined
                      </p>
                    </td>

                    <td className="py-3 px-4">
                      <DayStrip row={r} />
                      <p className={`text-xs mt-1 ${todayLine(r).tone}`}>{todayLine(r).text}</p>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex gap-0.5" aria-label={`${r.name}: ${r.cleanWeeks} clean weeks`}>
                        {r.weeks.map((w) => (
                          <div
                            key={w.week}
                            title={`Week ${w.week}: ${w.outcome}`}
                            className={`h-4 flex-1 rounded-sm ${OUTCOME_STYLE[w.outcome]}`}
                          />
                        ))}
                        <div
                          title={`Week ${r.currentWeekProgress.week}: ${credit(r.currentWeekProgress.credits)}/${r.currentWeekProgress.needed} so far`}
                          className="h-4 flex-1 rounded-sm border border-dashed border-ink-faint"
                        />
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right tnum font-semibold text-ink">{r.cleanWeeks}</td>
                    <td className="py-3 px-3 text-right tnum text-ink">{rupees(r.fineIfMissed)}</td>
                    <td className="py-3 px-3 text-right tnum text-ink-muted">{rupees(r.paid)}</td>
                    <td
                      className={`py-3 px-4 text-right tnum font-semibold ${
                        r.outstanding ? "text-owed-600" : "text-clean-600"
                      }`}
                    >
                      {rupees(r.outstanding)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {openPlayer ? <PlayerSheet userId={openPlayer} onClose={() => setOpenPlayer(null)} /> : null}

      <section className="pt-4 border-t border-line">
        <GroupStats rows={rows} currentUserId={currentUser?.id} goals={goals} />
      </section>

      <section className="pt-2">
        <h3 className="display text-2xl mb-1">Lately</h3>
        <p className="text-sm text-ink-muted mb-3">Fines, payments and goals as they land.</p>
        <Feed currentUserId={currentUser?.id} />
      </section>
    </div>
  );
};

export default GroupBoard;
