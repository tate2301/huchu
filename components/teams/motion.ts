/**
 * Motion tokens (K8). Each is a CSS custom property in `teams.css` (`--tm-arrive`, `--tm-fill` ...); this is
 * the same table for the kit sheet and for tests. Reduced motion is set where each is used.
 */
export type MotionToken = {
  name: string;
  /** Milliseconds; a loop's length for the ones that repeat. */
  ms: number;
  loop?: boolean;
  easing: string;
  usedFor: string;
  reduced: string;
};

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export const MOTION: readonly MotionToken[] = [
  { name: "arrive", ms: 260, easing: EASE_OUT, usedFor: "Events, people, the call strip", reduced: "fade 120 ms" },
  { name: "sheet", ms: 280, easing: EASE_OUT, usedFor: "Sheets from the right", reduced: "fade 120 ms" },
  { name: "pane", ms: 200, easing: EASE, usedFor: "Tabs and the panel", reduced: "none" },
  { name: "fill", ms: 700, easing: EASE_OUT, usedFor: "Progress, checklists, seats", reduced: "none" },
  { name: "flash", ms: 1600, easing: EASE, usedFor: "A value someone else changed", reduced: "none" },
  { name: "pop", ms: 160, easing: EASE, usedFor: "A badge count changing", reduced: "none" },
  { name: "livepulse", ms: 1600, loop: true, easing: EASE, usedFor: "Vane working", reduced: "a still dot" },
  { name: "talk", ms: 1600, loop: true, easing: EASE, usedFor: "Who is talking", reduced: "a still ring" },
  { name: "sk", ms: 1400, loop: true, easing: "linear", usedFor: "Loading", reduced: "a still block" },
];

/** The CSS timing function of a token as a function of time: x is 0 to 1 along the duration, the result is progress. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let s = x;
    for (let i = 0; i < 24; i++) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

const CURVES: Record<string, (t: number) => number> = {
  [EASE]: cubicBezier(0.2, 0, 0, 1),
  [EASE_OUT]: cubicBezier(0.16, 1, 0.3, 1),
  linear: (t) => t,
};

/** How far along a token's motion is at `ms`, 0 to 1, by the token's own duration and easing. */
export function progressAt(name: string, ms: number): number {
  const token = MOTION.find((m) => m.name === name);
  if (!token) throw new Error(`No motion token named ${name}`);
  return CURVES[token.easing](ms / token.ms);
}
