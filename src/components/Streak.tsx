import React from "react";
import { liveStreak, streakAtRisk, StreakInput } from "../utils/streak";
import { todayIndex } from "../utils/today";

/** 🔥 and a count; ⏳ beside it when this week could still break it. */
const Streak: React.FC<{ row: StreakInput; size?: "sm" | "lg" }> = ({ row, size = "sm" }) => {
  const n = liveStreak(row);
  const risk = streakAtRisk(row, todayIndex());
  const label = `${n} clean week${n === 1 ? "" : "s"} in a row${risk ? ", this week not cleared yet" : ""}`;

  if (size === "lg") {
    return (
      <div className="flex items-center gap-2" aria-label={label} title={label}>
        <span className={`text-4xl leading-none ${n ? "" : "grayscale opacity-40"}`} aria-hidden="true">
          🔥
        </span>
        <div>
          <div className="display text-4xl leading-none tabular-nums">{n}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            week streak{risk ? " ⏳" : ""}
          </div>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${n ? "text-ink" : "text-ink-faint"}`}
      aria-label={label}
      title={label}
    >
      <span className={n ? "" : "grayscale opacity-40"} aria-hidden="true">
        🔥
      </span>
      {n}
      {risk ? <span aria-hidden="true">⏳</span> : null}
    </span>
  );
};

export default Streak;
