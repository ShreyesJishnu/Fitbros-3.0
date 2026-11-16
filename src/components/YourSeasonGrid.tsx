import React from "react";
import { WorkoutDay, WorkoutKind } from "../types";
import { SEASON_WEEKS } from "../utils/seasonEngine";
import { cleanRun, heatClass } from "../utils/streak";
import { todayIndex } from "../utils/today";
import { SquadRow } from "./SquadWall";
import Streak from "./Streak";

/**
 * Your whole season as GitHub draws contributions: a column per week, a square
 * per day. The weeks still ahead are drawn too — the empty columns are the
 * point, they are what is left to fill.
 *
 * Under each played week, a dot says how the rules judged it.
 */

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const OUTCOME_DOT: Record<string, string> = {
  missed: "bg-owed-500",
  excused: "bg-ink-faint",
};

export const dayGrid = (
  userId: string,
  workoutDays: WorkoutDay[]
): Map<string, WorkoutKind> => {
  const grid = new Map<string, WorkoutKind>();
  for (const w of workoutDays) {
    if (w.userId === userId && w.isCompleted) grid.set(`${w.week}:${w.dayOfWeek}`, w.kind ?? "session");
  }
  return grid;
};

const YourSeasonGrid: React.FC<{
  row: SquadRow;
  workoutDays: WorkoutDay[];
  currentWeek: number;
}> = ({ row, workoutDays, currentWeek }) => {
  const grid = dayGrid(row.userId, workoutDays);
  const outcomes = new Map(row.weeks.map((w) => [w.week, w.outcome]));
  const runs = cleanRun(row.weeks);
  const today = todayIndex();
  const trained = Array.from(grid.values()).filter((k) => k === "session").length;

  return (
    <section aria-labelledby="your-season-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="your-season-title" className="display text-2xl leading-none">
            Your season
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            {trained} session{trained === 1 ? "" : "s"} in · {SEASON_WEEKS - currentWeek} weeks to go
          </p>
        </div>
        <Streak row={row} size="lg" />
      </div>

      {/* One grid, filled column by column: the day letters share rows with the
          squares, so they line up at any width. */}
      <div
        className="mt-4 grid gap-[3px] items-center"
        style={{
          gridTemplateColumns: `auto repeat(${SEASON_WEEKS}, minmax(0, 1fr))`,
          gridTemplateRows: "repeat(7, auto) 6px",
          gridAutoFlow: "column",
        }}
        role="img"
        aria-label={`Your season so far, ${trained} sessions over ${currentWeek} weeks`}
      >
        {DAYS.map((d, i) => (
          <span key={`d${i}`} className="pr-1 text-[9px] leading-none text-ink-faint">
            {i % 2 === 0 ? d : ""}
          </span>
        ))}
        <span />
        {Array.from({ length: SEASON_WEEKS }, (_, k) => {
          const week = k + 1;
          const ahead = week > currentWeek;
          const outcome = outcomes.get(week);
          return (
            <React.Fragment key={week}>
              {DAYS.map((_, i) => {
                const kind = grid.get(`${week}:${i + 1}`);
                const isToday = week === currentWeek && i === today;
                const future = ahead || (week === currentWeek && i > today);
                return (
                  <span
                    key={i}
                    title={`Week ${week}, ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}${
                      kind ? `: ${kind === "steps" ? "10k steps" : "workout"}` : ""
                    }`}
                    className={`block aspect-square rounded-[3px] ${
                      kind === "session"
                        ? "bg-clean-500"
                        : kind === "steps"
                          ? "bg-clean-500/40"
                          : future
                            ? "border border-line-soft"
                            : "bg-paper-sunk"
                    } ${isToday ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""}`}
                  />
                );
              })}
              <span
                className={`justify-self-center w-1.5 h-1.5 rounded-full ${
                  outcome === "clean" ? heatClass(runs.get(week) ?? 1) : outcome ? OUTCOME_DOT[outcome] : ""
                }`}
                title={outcome ? `Week ${week}: ${outcome}` : undefined}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-clean-500" />workout</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-clean-500/40" />10k steps</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-clean-500" /><span className="w-1.5 h-1.5 rounded-full bg-clean-600 -ml-1" /><span className="w-1.5 h-1.5 rounded-full bg-clean-700 -ml-1" />clean week, deeper in a row</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-owed-500" />fined week</span>
      </div>
    </section>
  );
};

export default YourSeasonGrid;
