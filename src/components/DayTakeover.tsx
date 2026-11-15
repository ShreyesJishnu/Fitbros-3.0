import React, { useEffect, useRef, useState } from "react";
import { TakeoverKind, TakeoverShow } from "../utils/takeover";
import "./DayTakeover.css";

/**
 * Your day, full screen, for three seconds: on opening the app and on every
 * log. A slumped figure for nothing yet, a runner for a walk, the gold one for
 * a workout.
 *
 * Decoration only. The toast beside it already says what was saved, so this is
 * hidden from screen readers and never takes focus — a tap anywhere or Escape
 * puts the page back.
 */

const LOOK: Record<TakeoverKind, { src: string; color: string; status: string; detail: (day?: string) => string }> = {
  none: {
    src: "/takeover/none.webp",
    color: "#4fd08f",
    status: "Not done",
    detail: (day) => (day ? `${day} cleared` : "Nothing logged today. Still time."),
  },
  steps: {
    src: "/takeover/steps.webp",
    color: "#5aa8ff",
    status: "Walked it",
    detail: (day) => (day ? `${day} · 10k steps, half a workout` : "10k steps, half a workout"),
  },
  session: {
    src: "/takeover/session.webp",
    color: "#f5b23d",
    status: "Workout done",
    detail: (day) => (day ? `${day} · a full credit` : "A full credit. Good job."),
  },
};

// Fetched as soon as this module loads, so the first open is not a blank room.
if (typeof window !== "undefined") {
  Object.values(LOOK).forEach(({ src }) => {
    const img = new Image();
    img.src = src;
  });
}

const SHOW_MS = 3200;
const LEAVE_MS = 300;
const DOTS = 12;
const SPARKS = Array.from({ length: 22 }, (_, k) => {
  const a = (k / 22) * Math.PI * 2;
  const r = 120 + ((k * 37) % 50);
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7 - 40 };
});

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const DayTakeover: React.FC<{ show: TakeoverShow | null; name: string; onDone: () => void }> = ({
  show,
  name,
  onDone,
}) => {
  const [leaving, setLeaving] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const cut = useRef<() => void>(() => {});

  // A new show restarts the clock; a tap or Escape cuts it short.
  useEffect(() => {
    if (!show) return;
    setLeaving(false);
    let gone = 0;
    const leave = () => {
      setLeaving(true);
      gone = window.setTimeout(() => done.current(), reducedMotion() ? 0 : LEAVE_MS);
    };
    const timer = window.setTimeout(leave, SHOW_MS);
    cut.current = leave;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(gone);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  // The ring: dots on an ellipse round the waist, the near half in front.
  useEffect(() => {
    if (!show || !hero.current) return;
    const box = hero.current;
    const dots = Array.from(box.querySelectorAll<HTMLElement>(".takeover-dot"));
    const still = reducedMotion();
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const grow = still ? 1 : Math.min(1, Math.max(0, t / 0.9));
      const rx = box.clientWidth * 0.4 * grow;
      const ry = box.clientHeight * 0.06 * grow;
      const cy = box.clientHeight * 0.55;
      dots.forEach((d, k) => {
        const a = (still ? 0 : t * 1.1) + (k / dots.length) * Math.PI * 2;
        const front = Math.sin(a) > 0;
        d.style.transform = `translate(${Math.cos(a) * rx}px, ${cy + Math.sin(a) * ry}px)`;
        d.style.zIndex = front ? "3" : "1";
        d.style.opacity = String((front ? 1 : 0.45) * grow);
      });
      if (!still) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [show]);

  if (!show) return null;
  const look = LOOK[show.kind];

  return (
    <div
      key={show.id}
      className={`takeover${leaving ? " leaving" : ""}`}
      style={{ ["--takeover-c" as string]: look.color }}
      aria-hidden="true"
      onClick={() => cut.current()}
    >
      <div className="takeover-who">{name} · {show.day ?? "today"}</div>
      <div className="takeover-hero" ref={hero}>
        <img className="takeover-fig" src={look.src} alt="" draggable={false} />
        {Array.from({ length: DOTS }, (_, k) => (
          <span
            key={`d${k}`}
            className="takeover-dot"
            style={{ width: k % 3 === 0 ? 7 : 4, height: k % 3 === 0 ? 7 : 4, margin: k % 3 === 0 ? "-3.5px 0 0 -3.5px" : "-2px 0 0 -2px", opacity: 0 }}
          />
        ))}
        {SPARKS.map((s, k) => (
          <span key={`s${k}`} className="takeover-spark" style={{ ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px` }} />
        ))}
      </div>
      <div className="takeover-status">{look.status}</div>
      <div className="takeover-detail">{look.detail(show.day)}</div>
      <div className="takeover-skip">Tap anywhere to continue</div>
    </div>
  );
};

export default DayTakeover;
