/**
 * The accent a record is drawn in.
 *
 * The hues are the design system's — `ACCENT_HUES` in `@corelithzw/react`,
 * kept restated here rather than imported because this module is read by zod
 * schemas on API routes, and a server route has no business pulling in a
 * component library to learn a list of thirteen strings. The
 * `accents.test.ts` case pins the two lists together, so they cannot drift.
 *
 * Everything visual — the hash from a name to a hue, the tokens themselves —
 * comes from the design system. Components call `accentFor` and set
 * `data-accent`; there are deliberately no colour classes in this file, because
 * a second palette is a palette that goes out of date.
 */
export const ACCENTS = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "brown",
] as const;
export type Accent = (typeof ACCENTS)[number];

export function isAccent(value: string | null | undefined): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

export const ACCENT_LABELS: Record<Accent, string> = {
  gray: "Grey",
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  cyan: "Cyan",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  pink: "Pink",
  brown: "Brown",
};
