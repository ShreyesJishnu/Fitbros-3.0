/**
 * The one moment the season says yes.
 *
 * Hitting four credits is the only thing this app asks of anyone, and until now
 * the screen marked it with a colour change. A week going clean is worth more
 * noise than that — it is a group of friends with money on it, not a filing
 * system.
 *
 * Written rather than installed: a burst of rectangles under gravity is about
 * forty lines, and a dependency for it would be larger than the feature. Draws
 * on a throwaway canvas above everything, cleans itself up, and never blocks a
 * tap — `pointer-events: none` means it cannot swallow the next one.
 *
 * Honours the season's own colours, so the celebration is in the same palette
 * as the thing being celebrated.
 */

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

const GRAVITY = 0.32;
const DRAG = 0.992;
const LIFETIME_MS = 1700;

/** Reads a season colour straight off the stylesheet, so themes stay in step. */
const token = (name: string, fallback: string): string => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : fallback;
};

/**
 * Fire a burst from a point on screen — usually the cell that just filled.
 *
 * Anyone who has asked the operating system to stop moving things gets nothing,
 * silently. That is the whole accommodation: no motion, no apology, and the
 * colour change still carries the news on its own.
 */
export function celebrate(origin?: { x: number; y: number }): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const colors = [
    token("--clean-500", "rgb(47,111,78)"),
    token("--clean-600", "rgb(47,111,78)"),
    token("--clean-100", "rgb(232,242,236)"),
    token("--skip-500", "rgb(154,107,18)"),
    token("--ink", "rgb(27,29,25)"),
  ];

  const from = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  const pieces: Piece[] = Array.from({ length: 70 }, () => {
    // Up and outward, widest at the top — a burst, not a fountain.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
    const speed = 5 + Math.random() * 9;
    return {
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const started = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const elapsed = now - started;
    if (elapsed > LIFETIME_MS) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // Fade the whole burst out rather than popping it off screen.
    ctx.globalAlpha = Math.max(0, 1 - elapsed / LIFETIME_MS);

    for (const p of pieces) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      // Squashed on the spin, so a flat rectangle reads as a tumbling scrap.
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  // A tab hidden mid-burst never gets another frame, so the canvas would stay
  // on the page forever. Belt and braces.
  window.setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, LIFETIME_MS + 400);
}
