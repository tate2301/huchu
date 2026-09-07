import { accentFor } from "@corelithzw/react";

import { isAccent, type Accent } from "./accents";

/**
 * What a record should be drawn in: the hue somebody picked for it, else one
 * derived from its own name.
 *
 * The derived case is what actually removes the grey. Nothing is stored, every
 * client computes the same hue from the same string, and a list of two hundred
 * companies stops being a column of identical marks without anybody colouring
 * a single row by hand.
 *
 * The hash is the design system's `accentFor`, not one of our own, so a record
 * whose colour we resolve here matches the same record drawn by an `Avatar` or
 * an `IconTile` that derived its own.
 */
export function recordAccent(
  chosen: string | null | undefined,
  seed: string | null | undefined,
): Accent {
  if (isAccent(chosen)) return chosen;
  return accentFor(seed?.trim() || "untitled");
}
