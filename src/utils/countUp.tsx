import React, { useEffect, useRef, useState } from "react";

/**
 * Money that arrives at its number instead of appearing at it.
 *
 * The pot and what somebody owes are the two figures anyone opens this app for,
 * and they used to blink into place with the rest of the layout. A figure that
 * climbs is read, because the eye follows a number that is still moving.
 *
 * Only the two headline sums get this. A rolling number is slower to read than
 * a still one, so it is spent where the reading is the point and never on a
 * table of them.
 */

/**
 * Cubic ease-out, in whole rupees — a roll should never show paise.
 *
 * The progress is clamped here rather than at the call site because a frame can
 * genuinely arrive before the roll started: requestAnimationFrame hands the
 * callback the time the frame began, which may predate the clock reading taken
 * when the effect ran. Unclamped, that first frame put the pot at minus eleven
 * rupees for a sixteenth of a second.
 */
export const eased = (from: number, to: number, t: number): number => {
  const progress = Math.min(1, Math.max(0, t));
  return Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3)));
};

const DURATION_MS = 650;

export function useCountUp(value: number, duration = DURATION_MS): number {
  // Starts at nothing, so the figure climbs as the data lands: these screens
  // paint a skeleton first and mount with the final number already in hand.
  const [shown, setShown] = useState(0);
  // What is on screen this instant. A value that changes mid-roll carries on
  // from where the eye left it rather than snapping back to the old start.
  const shownRef = useRef(0);

  useEffect(() => {
    if (shownRef.current === value) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = value;
      setShown(value);
      return;
    }

    const begin = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      shownRef.current = eased(begin, value, t);
      setShown(shownRef.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

/**
 * The rolling figure itself.
 *
 * A component rather than a hook at the call site: both screens that use it
 * return a skeleton before the money exists, and a hook after an early return
 * is a hook that does not run on every render.
 */
export const Rupees: React.FC<{ value: number }> = ({ value }) => (
  <>{`₹${useCountUp(value).toLocaleString("en-IN")}`}</>
);
