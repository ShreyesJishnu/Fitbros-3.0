import React, { useEffect, useRef } from "react";
import { celebrate } from "../utils/confetti";
import { flameMilestone, flameTier, liveStreak, streakAtRisk, StreakInput } from "../utils/streak";
import { todayIndex } from "../utils/today";

/** The count warms with the flame: plain ink for a first week, amber from three. */
const COUNT_TONE = ["text-ink-faint", "text-ink", "text-skip-600", "text-skip-600", "text-skip-600"];

/** 🔥 and a count; ⏳ beside it when this week could still break it. */
const Streak: React.FC<{ row: StreakInput; size?: "sm" | "lg" }> = ({ row, size = "sm" }) => {
  const n = liveStreak(row);
  const tier = flameTier(n);
  const risk = streakAtRisk(row, todayIndex());
  const label = `${n} clean week${n === 1 ? "" : "s"} in a row${risk ? ", this week not cleared yet" : ""}`;

  // Only the big flame celebrates: it is the player's own, and the small ones
  // are nine other people's numbers that change when somebody else logs.
  const flame = useRef<HTMLSpanElement>(null);
  const before = useRef(n);
  useEffect(() => {
    if (size === "lg" && flameMilestone(before.current, n)) {
      const box = flame.current?.getBoundingClientRect();
      const onScreen = !!box && box.bottom > 0 && box.top < window.innerHeight;
      celebrate(onScreen ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : undefined, {
        count: 110,
        flame: true,
      });
    }
    before.current = n;
  }, [n, size]);

  if (size === "lg") {
    return (
      <div className="flex items-center gap-2" aria-label={label} title={label}>
        <span ref={flame} key={`flame-${n}`} className={`text-4xl leading-none ${n ? "animate-pop" : ""}`} aria-hidden="true">
          <span className={n ? `flame-${tier}` : "grayscale opacity-40"}>🔥</span>
        </span>
        <div>
          <div key={n} className={`display text-4xl leading-none tabular-nums animate-bump ${COUNT_TONE[tier]}`}>
            {n}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            week streak{risk ? " ⏳" : ""}
          </div>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${COUNT_TONE[tier]}`}
      aria-label={label}
      title={label}
    >
      <span className={n ? `flame-${tier}` : "grayscale opacity-40"} aria-hidden="true">
        🔥
      </span>
      {n}
      {risk ? <span aria-hidden="true">⏳</span> : null}
    </span>
  );
};

export default Streak;
