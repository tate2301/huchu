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
