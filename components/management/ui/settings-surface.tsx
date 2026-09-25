"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Management and account preferences, as one surface opened over the app.
 *
 * Built on `components/ui/dialog.tsx` at `size="full"` so the opening is the
 * component's own — `fade-in-0`, `zoom-in .985`, 200ms, and no zoom at all
 * under `prefers-reduced-motion`, which is exactly what `Opening.dc.html`
 * draws. Nothing is reimplemented here; what the call sites below do is undo
 * the parts of `.modal-card` that disagree with `Main.dc.html`:
 *
 *   - `max-w-none w-full` — `.modal-full` sets `--modal-max-w:
 *     calc(100vw - 64px)`, a 32px horizontal gutter against the board's 24.
 *     Dropping the cap hands the gutter to the viewport's own `sm:p-6`, which
 *     is 24px on every side.
 *   - `p-0` — the card owns the content padding at `inset`, but this surface
 *     is a grid whose columns each scroll separately and set their own.
 *   - `rounded-[var(--radius-2xl)] border-0` — 18px and no border.
 *   - `showClose={false}` — the board's close sits in the record header, where
 *     the other verbs are. The built-in one is absolutely positioned at the
 *     card's corner and would land on top of the list column.
 *
 * The scrim is darkened to `rgba(22,24,29,.55)` from the stylesheet; see the
 * note beside `.modal-scrim` in `settings.module.css` for why it is not a prop.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        tabletBehavior="centered"
        showClose={false}
        data-settings-surface=""
        className={cn(
          styles.scope,
          styles.surface,
          // Utilities sit above `@layer components`, so anything the cva or
          // `.modal-card` sets as a *utility* has to be answered with one:
          // the radius (cva's `rounded-2xl` is 16px, the board is 18), the
          // max-width cap, the card's own padding and gap, its border, its
          // `overflow-y-auto`, and the tablet height clamp that would leave a
          // gap under the surface between 768 and 1023px.
          "h-full w-full max-w-none gap-0 overflow-y-hidden rounded-[var(--radius-2xl)]",
          "border-0 p-0 sm:p-0 md:max-lg:max-h-[calc(100dvh-3rem)]",
          className,
        )}
      >
        {/* Both are taken out of flow — `DialogDescription` is `sr-only` by
            default and the title is given `srOnly` here — so neither becomes
            a column of the two-column grid. The dialog keeps its accessible
            name and description; the grid keeps exactly two children, the
            rail and the content. */}
        <DialogTitle className={styles.srOnly}>{title}</DialogTitle>
        <DialogDescription className={styles.srOnly}>
          {`${title} — management and account preferences`}
        </DialogDescription>
        {/* A context provider renders nothing of its own, so the grid still
            has exactly two children: the rail and the content. */}
        <SettingsSurfaceCloseContext.Provider value={close}>
          {rail}
          {children}
        </SettingsSurfaceCloseContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
