import React from "react";
import { GroupRow } from "./GroupBoard";
import Streak from "./Streak";
import { isWeekClean, liveStreak } from "../utils/streak";

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

const CELL: Record<string, string> = {
  clean: "bg-clean-500",
  missed: "bg-owed-500/80",
  excused: "bg-ink-faint/30",
};

const SquadWall: React.FC<{ rows: SquadRow[]; currentWeek: number; currentUserId?: string }> = ({
  rows,
  currentWeek,
  currentUserId,
}) => {
  const pulse = squadPulse(rows, currentWeek);
  const health = squadHealth(pulse);
  const clearedNow = rows.filter((r) => isWeekClean(r.currentWeekProgress)).length;
  const ranked = [...rows].sort(
    (a, b) => liveStreak(b) - liveStreak(a) || b.cleanWeeks - a.cleanWeeks || a.name.localeCompare(b.name)
  );
  const cols = `minmax(0, 5.5rem) repeat(${currentWeek}, minmax(0, 1.75rem)) 2.75rem`;

  return (
    <section aria-labelledby="squad-title">
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
        <div className="grid gap-[3px] items-center w-max min-w-full" style={{ gridTemplateColumns: cols }}>
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
            const { credits, needed } = r.currentWeekProgress;
            const progress = needed ? Math.min(1, credits / needed) : 0;
            return (
              <React.Fragment key={r.userId}>
                <span className={`truncate text-sm pr-2 ${me ? "font-semibold text-ink" : "text-ink-muted"}`}>
                  <span aria-hidden="true" className="mr-1">{r.avatar || r.name.charAt(0).toUpperCase()}</span>
                  {me ? "You" : r.name}
                </span>
                {Array.from({ length: currentWeek }, (_, k) => {
                  const week = k + 1;
                  if (week === currentWeek) {
                    return (
                      <span
                        key={week}
                        title={`${r.name}, week ${week}: ${credits} of ${needed}`}
                        className="relative block aspect-square rounded-[4px] border border-dashed border-clean-500 overflow-hidden"
                      >
                        <span className="absolute inset-x-0 bottom-0 bg-clean-500" style={{ height: `${progress * 100}%` }} />
                      </span>
                    );
                  }
                  const outcome = outcomes.get(week);
                  return (
                    <span
                      key={week}
                      title={`${r.name}, week ${week}: ${outcome ?? "not in yet"}`}
                      className={`block aspect-square rounded-[4px] ${outcome ? CELL[outcome] : "bg-paper-sunk/50"} ${
                        me ? "ring-1 ring-ink/20" : ""
                      }`}
                    />
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-clean-500" />clean</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-owed-500/80" />fined</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-ink-faint/30" />away</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] border border-dashed border-clean-500" />this week</span>
      </div>
    </section>
  );
};

export default SquadWall;
