"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type SettingsSurfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The dialog's accessible name. Visually hidden — the surface draws its own
   * "Settings" wordmark in the rail, and two titles is one too many.
   */
  title?: string;
  /** The rail. Normally a `<SettingsRail />`. */
  rail: React.ReactNode;
  /** Everything right of the rail: a `<RegisterLayout />` or a `<FormPage />`. */
  children: React.ReactNode;
  className?: string;
};

/**
 * The scope the surface's control corrections are written against.
 *
 * `data-settings-surface` is the readable name of it; `styles.scope` is what
 * the stylesheet can actually select on (see the note beside `.scope` in
 * `settings.module.css`). Both are written on the surface's own root **and**,
 * while it is open, on `document.body` — because every create/edit dialog
 * opened from here goes through `DialogPortal`, which moves its content to
 * `document.body` and out of the surface's subtree. A rule hung off
 * `.surface` reaches none of it.
 *
 * Marking `document.body` rather than the subtree is what makes the
 * correction reach a portalled dialog; taking the mark off again on close is
 * what stops it reaching anything else. While it is on, the surface is the
 * only thing on screen.
 */
const SCOPE_ATTRIBUTE = "data-settings-surface";

/**
 * The surface's own "close" verb, handed down to whatever draws the header.
 *
 * `Main.dc.html` draws the close on the surface — a rule, then a 32×32 × — at
 * the right-hand end of the record header's action group, beside the `…`.
 * That is where the reader is already looking for the record's verbs, but the
 * header is a presentation component several routes deep and the thing that
 * can actually close the surface is this component. So the handler travels by
 * context rather than by a prop threaded through twenty-two call sites.
 *
 * It is the *same* handler Escape uses: the dialog's Escape path is
 * `onOpenChange(false)` and so is this, so the two exits cannot drift apart.
 *
 * `null` outside a surface, which is how `RecordHeader` knows not to draw a
 * close at all — a header on a page that is not a surface has nothing to
 * close.
 */
const SettingsSurfaceCloseContext = React.createContext<(() => void) | null>(null);

/**
 * The surface's close handler, or `null` when there is no surface above.
 * See {@link SettingsSurfaceCloseContext}.
 */
export function useSettingsSurfaceClose(): (() => void) | null {
  return React.useContext(SettingsSurfaceCloseContext);
}

function useSurfaceScope(open: boolean, scopeClassName: string) {
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const { body } = document;
    body.setAttribute(SCOPE_ATTRIBUTE, "");
    body.classList.add(scopeClassName);

    return () => {
      body.removeAttribute(SCOPE_ATTRIBUTE);
      body.classList.remove(scopeClassName);
    };
  }, [open, scopeClassName]);
}

/**
 * Management and account preferences, as one surface that takes the whole page
 * (design/core-modules/spec/shell.md: "a full-page takeover with no rail").
 *
 * A page, not a dialog: `AppShell` renders these routes bare
 * (`isSettingsSurfacePath`), so nothing sits under the surface to dim or trap
 * focus away from, and a page lets a phone scroll the document. Esc still
 * leaves, through the same `onOpenChange(false)` the record header's Close
 * uses.
 *
 * Presentation only: this component opens and closes, and holds nothing else.
 * Which route is behind it, and who may reach it, stay where they are.
 */
export function SettingsSurface({
  open,
  onOpenChange,
  title = "Settings",
  rail,
  children,
  className,
}: SettingsSurfaceProps) {
  useSurfaceScope(open, styles.scope);

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  // Esc leaves Management, as it did when the surface was a dialog, unless a
  // field, a menu or a dialog of its own has it.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  if (!open) return null;
  return (
    <div
      role="region"
      aria-label={title}
      data-settings-surface=""
      className={cn(styles.scope, styles.surface, className)}
    >
      {/* A context provider renders nothing of its own, so the grid still
          has exactly two children: the rail and the content. */}
      <SettingsSurfaceCloseContext.Provider value={close}>
        {rail}
        {children}
      </SettingsSurfaceCloseContext.Provider>
    </div>
  );
}
