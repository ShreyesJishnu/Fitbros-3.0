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

/** A season colour straight off the stylesheet, as `[r, g, b]`. */
const token = (name: string, fallback: [number, number, number]): [number, number, number] => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  return parts.length === 3 ? (parts as [number, number, number]) : fallback;
};

const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Only colours that can actually be seen against the page behind them.
 *
 * The first version picked five fixed tokens, one of which was `clean-100` — a
 * near-paper tint that measured 1.17:1 on the light theme, so a fifth of the
 * burst was invisible. The page's own background decides now, which also means
 * a future change to the palette cannot quietly empty the confetti again.
 */
const MIN_CONTRAST = 2;

/**
 * Fire a burst from a point on screen — usually the cell that just filled.
 *
 * Anyone who has asked the operating system to stop moving things gets nothing,
 * silently. That is the whole accommodation: no motion, no apology, and the
 * colour change still carries the news on its own.
 */
export function celebrate(
  origin?: { x: number; y: number },
  opts: { count?: number; flame?: boolean } = {}
): void {
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

  const behind = token("--paper", [244, 243, 239]);
  // A streak milestone is the flame's moment: embers first, the season's green
  // behind them. Same contrast filter below, so neither theme loses pieces.
  const palette: [number, number, number][] = opts.flame
    ? [
        token("--skip-500", [154, 107, 18]),
        token("--skip-600", [128, 88, 14]),
        token("--owed-500", [168, 58, 30]),
        token("--clean-500", [47, 111, 78]),
        token("--ink", [27, 29, 25]),
      ]
    : [
        token("--clean-500", [47, 111, 78]),
        token("--clean-600", [38, 92, 64]),
        token("--owed-500", [168, 58, 30]),
        token("--skip-500", [154, 107, 18]),
        token("--ink", [27, 29, 25]),
      ];
  const visible = palette.filter((c) => contrast(c, behind) >= MIN_CONTRAST);
  const colors = (visible.length ? visible : palette).map(([r, g, b]) => `rgb(${r},${g},${b})`);

  const from = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  const pieces: Piece[] = Array.from({ length: opts.count ?? 70 }, () => {
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
