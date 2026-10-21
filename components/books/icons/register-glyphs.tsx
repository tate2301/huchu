"use client";

import { CI_GLYPHS } from "./glyphs";
import { registerBooksGlyphs } from "./registry";

// At load, before the Books page renders, so its first paint has the pack.
registerBooksGlyphs(CI_GLYPHS);

/** Loads Corelith UI icons with the Books layout. Draws nothing. */
export function BooksGlyphs() {
  registerBooksGlyphs(CI_GLYPHS);
  return null;
}
