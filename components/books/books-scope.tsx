"use client";

import * as React from "react";

import { IconRendererProvider, type IconRenderer } from "@/components/core";

import { CiGlyphIcon } from "./icons/glyph-icon";
import { KIT_TO_CI } from "./icons/kit-map";
import { useBooksGlyphs } from "./icons/registry";

/**
 * The shell sits inside this while a Books page is open: Corelith UI icons
 * through the kit's `Icon` (the app bar, the page and its drawers), and the
 * Books face on the root (`:root[data-module="books"]` in books-type.css), so
 * menus and drawers portalled to <body> take it too. Books only, as the owner
 * set on 20 Oct (design/books/NOTES.md §0, §3).
 */
export function BooksScope({ active, children }: { active: boolean; children: React.ReactNode }) {
  React.useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.module = "books";
    return () => {
      if (root.dataset.module === "books") delete root.dataset.module;
    };
  }, [active]);
  const glyphs = useBooksGlyphs();
  // The kit's icons drawn from Corelith UI icons, for everything under a Books page.
  const renderer = React.useMemo<IconRenderer | null>(() => {
    if (!active || !glyphs) return null;
    const render: IconRenderer = (name, { size, className }) => {
      const glyph = glyphs[KIT_TO_CI[name] ?? ""];
      return glyph ? <CiGlyphIcon glyph={glyph} size={size} className={className} /> : null;
    };
    return render;
  }, [active, glyphs]);
  return <IconRendererProvider renderer={renderer}>{children}</IconRendererProvider>;
}

/** Whether an address is a Books page, where the shell draws in Books' face and icons. */
export function isBooksPath(pathname: string | null | undefined) {
  return pathname === "/books" || Boolean(pathname?.startsWith("/books/"));
}
