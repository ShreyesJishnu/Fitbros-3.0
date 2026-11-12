import React from "react";
import { WorkoutKind } from "../types";

/**
 * Seven days of one week, read-only.
 *
 * One owner, two screens: the group board draws the running week on every row,
 * and a player's sheet draws every week they have had. Drawn twice they drift —
 * which is how a logged day once meant two different colours on two screens.
 *
 * Logging lives on My season, which has its own grid because its days are
 * buttons. These are not.
 */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The same two fills My season uses for a logged day. */
export const DAY_STYLE: Record<WorkoutKind, string> = {
  session: "bg-clean-500 border-clean-500",
  // A bare block has no label to lean on the way My season's buttons do, so the
  // half a workout is carried by a heavier edge, not by the fill alone.
  steps: "bg-clean-100 border-2 border-clean-500",
};

export const DAY_LABEL: Record<WorkoutKind, string> = {
  session: "a workout",
  steps: "10k steps",
};

const DayCells: React.FC<{
  days: (WorkoutKind | null)[];
  /** What a screen reader announces this strip as. */
  label: string;
  /**
   * Which day to ring, for the week still running. Drawn inset: Monday sits
   * flush against the left edge of a section that clips its overflow, so an
   * outside ring loses its left side and its offset paints the page colour
   * rather than whatever the row is sitting on.
   */
  today?: number;
}> = ({ days, label, today }) => (
  <div className="flex gap-1" role="list" aria-label={label}>
    {days.map((kind, i) => {
      const what = `${DAY_NAMES[i]}: ${kind ? DAY_LABEL[kind] : "nothing logged"}`;
      return (
        <div
          key={i}
          role="listitem"
          title={what}
          aria-label={what}
          className={`h-6 flex-1 rounded-md border ${
            kind ? DAY_STYLE[kind] : "bg-paper-card border-line"
          } ${i === today ? "ring-2 ring-inset ring-ink" : ""}`}
        />
      );
    })}
  </div>
);

export default DayCells;
