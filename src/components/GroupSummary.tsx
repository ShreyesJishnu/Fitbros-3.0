import React from "react";
import { WorkoutKind } from "../types";
import { PAYMENT_GRACE_HOURS } from "../utils/seasonEngine";
import { Rupees } from "../utils/countUp";
import { todayIndex } from "../utils/today";
import { GroupRow, overdueRoll } from "./GroupBoard";
import { isWeekClean } from "../utils/streak";

/**
 * The four numbers the Group tab opened with, now on the dashboard: who is in
 * for the pot, what is in it, what is still owed, and how far the week is.
 *
 * The overdue list came with them. A fine past its deadline stops being
 * private — that is a rule, and this is now the only place the group reads it.
 */

export type SummaryRow = Pick<
  GroupRow,
  "userId" | "name" | "potEligible" | "paid" | "outstanding" | "currentWeekProgress" | "unsettledFines"
> & { days?: (WorkoutKind | null)[]; hasLeft?: boolean };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const Tile: React.FC<{ label: string; children: React.ReactNode; note?: string }> = ({ label, children, note }) => (
  <div className="rounded-2xl bg-paper-card border border-line px-4 py-3">
    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
    <dd className="display text-3xl mt-1 tnum leading-none">{children}</dd>
    {note ? <dd className="text-xs text-ink-muted mt-1 tnum">{note}</dd> : null}
  </div>
);

const GroupSummary: React.FC<{ rows: SummaryRow[] }> = ({ rows }) => {
  // The pot is money that changed hands: leaving does not take payments out.
  const paid = rows.reduce((sum, r) => sum + r.paid, 0);
  const roster = rows.filter((r) => !r.hasLeft);
  const potCount = roster.filter((r) => r.potEligible).length;
  const owed = roster.reduce((sum, r) => sum + r.outstanding, 0);
  const weekDone = roster.filter((r) => isWeekClean(r.currentWeekProgress)).length;
  const trainedToday = roster.filter((r) => r.days?.[todayIndex()]).length;
  const overdue = overdueRoll(roster as GroupRow[]);
  const overdueTotal = overdue.reduce((sum, o) => sum + o.owed, 0);

  return (
    <div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="In for the pot">
          <span className="text-clean-600">{potCount}</span>
          <span className="text-ink-muted">/{roster.length}</span>
        </Tile>
        <Tile label="In the pot">
          <Rupees value={paid} />
        </Tile>
        <Tile label="Outstanding">
          <span className={owed ? "text-owed-600" : "text-clean-600"}>
            <Rupees value={owed} />
          </span>
        </Tile>
        <Tile label="Week done" note={`${trainedToday} trained today`}>
          <span className="text-clean-600">{weekDone}</span>
          <span className="text-ink-muted">/{roster.length}</span>
        </Tile>
      </dl>

      {/* Only while somebody is late. Paying up makes it disappear. */}
      {overdue.length ? (
        <div className="mt-3 border border-owed-100 bg-owed-50 rounded-2xl px-4 py-3">
          <p className="text-sm text-owed-700 font-semibold">
            {rupees(overdueTotal)} owed by {overdue.length} {overdue.length === 1 ? "person" : "people"} past the{" "}
            {PAYMENT_GRACE_HOURS}-hour deadline
          </p>
          <ul className="mt-2 space-y-1">
            {overdue.map((o) => (
              <li key={o.userId} className="text-sm text-ink flex justify-between gap-3">
                <span className="font-semibold truncate">{o.name}</span>
                <span className="tnum text-owed-600 shrink-0">
                  {rupees(o.owed)} · {o.days === 0 ? "due today" : `${o.days}d late`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default GroupSummary;
