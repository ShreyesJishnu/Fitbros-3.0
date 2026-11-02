import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Goal } from "../types";
import { apiFetch } from "../services/http";
import { GoalTrack, Reading, goalReadings } from "./GoalBoard";

/**
 * One player's season, opened from the group list.
 *
 * Read-only by design: you can see anyone's record, but the logging stays with
 * the person it belongs to.
 */


interface Season {
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
  weeks: { week: number; outcome: "clean" | "missed" | "excused"; credits: number; fine: number }[];
  currentWeekProgress: { week: number; credits: number; needed: number };
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Credit reads as 3 or 3.5, never 3.0. */
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const OUTCOME_STYLE = {
  clean: "bg-clean-500",
  missed: "bg-owed-500",
  // Neither kept nor missed. Grey says "not judged" where the two live colours
  // both say "scored".
  excused: "bg-line-soft",
} as const;

const PlayerSheet: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const [season, setSeason] = useState<Season | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState<Record<string, Reading[]>>({});
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const [seasonRes, goalsRes] = await Promise.all([
      apiFetch(`/season/${userId}`),
      apiFetch(`/goals/user/${userId}`),
    ]);
    const seasonData = seasonRes.ok ? await seasonRes.json() : null;
    const goalData: Goal[] = goalsRes.ok ? await goalsRes.json() : [];
    setSeason(seasonData);
    setGoals(goalData);

    setProgress(await goalReadings());
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes, as it should for anything that covers the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus goes back to the row that opened us. Mount-only: an inline onClose
  // would otherwise re-run this on every render and bounce focus out.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  // The close button only exists once the skeleton is replaced.
  useEffect(() => {
    if (season) closeRef.current?.focus();
  }, [season]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={season ? `${season.name}'s season` : "Player"}
      onClick={onClose}
    >
      <div
        className="bg-paper w-full sm:max-w-xl max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {!season ? (
          <div className="h-40 rounded-xl bg-line-soft animate-pulse" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-3xl">{season.name}</h2>
                <p className="text-sm text-ink-muted mt-0.5">
                  {rupees(season.fineIfMissed)} a missed week · {season.cleanStreak} week streak
                </p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] grid place-items-center rounded-xl text-ink-muted
                           hover:text-ink cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="grid grid-cols-4 border-y border-line mt-4 sm:divide-x divide-line">
              {[
                ["Clean", String(season.cleanWeeks), "text-clean-600"],
                ["Fined", String(season.missedWeeks), "text-owed-600"],
                ["Paid", rupees(season.paid), "text-ink"],
                ["Owed", rupees(season.outstanding), season.outstanding ? "text-owed-600" : "text-clean-600"],
              ].map(([label, value, tone]) => (
                <div key={label} className="py-3 pr-3 sm:px-3 sm:first:pl-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
                  <dd className={`display text-2xl tnum mt-0.5 ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>

            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted mt-5 mb-2">
              Week by week
            </p>
            <div className="flex gap-1">
              {season.weeks.map((w) => (
                <div
                  key={w.week}
                  title={`Week ${w.week}: ${credit(w.credits)} workouts${w.fine ? ` — ${rupees(w.fine)}` : ""}`}
                  className={`h-7 flex-1 rounded-md ${OUTCOME_STYLE[w.outcome]}`}
                />
              ))}
              <div className="h-7 flex-1 rounded-md border-2 border-dashed border-ink-faint" />
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted mt-6 mb-2">
              Goals
            </p>
            <ul className="divide-y divide-line border-t border-line">
              {goals.map((goal) => {
                const measured = goal.baselineValue != null && goal.targetValue != null;
                return (
                  <li key={goal.id} className="py-3">
                    <p className={`text-sm ${goal.isCompleted ? "text-ink-muted line-through" : "text-ink"}`}>
                      {goal.description}
                    </p>
                    {measured ? <GoalTrack goal={goal} readings={progress[goal.id] ?? []} /> : null}
                  </li>
                );
              })}
              {!goals.length ? <li className="py-4 text-sm text-ink-muted">No goals set yet.</li> : null}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default PlayerSheet;
