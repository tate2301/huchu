import * as React from "react";

import type { CiGlyph } from "./types";

/**
 * The whole pack, once a Books page has loaded it. The shell's `BooksScope`
 * reads it from here instead of importing it, so pages outside Books never
 * carry the pack (components/books/icons/register-glyphs.tsx loads it with
 * the Books layout).
 */
let glyphs: Readonly<Record<string, CiGlyph>> | null = null;
const listeners = new Set<() => void>();

export function registerBooksGlyphs(pack: Readonly<Record<string, CiGlyph>>) {
  if (glyphs === pack) return;
  glyphs = pack;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = () => glyphs;

export function useBooksGlyphs() {
  return React.useSyncExternalStore(subscribe, read, read);
}
