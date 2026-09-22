"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DotsThree, Pencil, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { useSettingsSurfaceClose } from "./settings-surface";
import styles from "./settings.module.css";

export type RecordHeaderProps = {
  title: string;
  /**
   * The 32px mark. Pass a filled entity icon and it is drawn in the tinted
   * tile; pass `mark` instead for a person, whose mark is their avatar.
   */
  icon?: React.ComponentType<{ className?: string }>;
  mark?: React.ReactNode;
  /**
   * Makes the title editable in place — rule 8. The pencil appears, clicking
   * either the title or the pencil opens it, Enter or blur commits, Escape
   * abandons. There is no edit mode and no save button for the name.
   */
  onRename?: (next: string) => void;
  /** `aria-label` for the pencil. Default: "Rename the record". */
  renameLabel?: string;
  /**
   * Only when the record is an exception — rule 5. A `<StatusBadge
   * context="header" />` returns `null` for a healthy state, so passing one
   * unconditionally is safe.
   */
  badge?: React.ReactNode;
  /** The one labelled verb — rule 3. Use `<HeaderAction />`. */
  action?: React.ReactNode;
  /**
   * The `…` menu's items, as `DropdownMenuItem`s. Destructive and rare actions
   * live here. Omit it and no overflow button is drawn — rule 9 says hide an
   * invalid action, never disable it.
   */
  overflow?: React.ReactNode;
  /** `aria-label` for the overflow button. Default: "More actions". */
  overflowLabel?: string;
  /**
   * `aria-label` for the close button. Default: "Close settings".
   *
   * The close itself is not a prop: it appears when this header is inside a
   * `SettingsSurface` and not otherwise, and it runs the surface's own close.
   */
  closeLabel?: string;
  className?: string;
};

/**
 * One line, then a rule.
 *
 * ```
 * [32px mark]  Title  ✎  (badge only if exceptional)      [one verb]  … │ ×
 * ─────────────────────────────────────────────────────────────────────────
 * ```
 *
 * The `×` is the surface's, not the record's — a 1px `#E5E8EE` divider and a
 * 32×32 icon button, exactly as `Main.dc.html` draws them, which is why it
 * sits past the divider rather than inside the record's own run of verbs. It
 * appears only inside a `SettingsSurface` (see `useSettingsSurfaceClose`) and
 * runs the same handler Escape does, so the surface's only exit is no longer
 * a keystroke nobody can see.
 *
 * Rule 4: no band under the title. Facts about the record belong in its fields
 * and in its list columns, not in a dot-separated strip repeating them under
 * the heading. That is why there is no `description` prop and no meta slot —
 * the two shells this replaces both had one, and both of them drew the same
 * three facts the fields below already showed.
 *
 * The title group carries `min-width: 0`, which is the whole reason a long
 * record name truncates with an ellipsis instead of painting over the actions.
 */
export function RecordHeader({
  title,
  icon: Icon,
  mark,
  onRename,
  renameLabel = "Rename the record",
  badge,
  action,
  overflow,
  overflowLabel = "More actions",
  closeLabel = "Close settings",
  className,
}: RecordHeaderProps) {
  const closeSurface = useSettingsSurfaceClose();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);

  // A rename that lands from elsewhere (a save, another tab) should show,
  // and should not be clobbered while somebody is typing over it.
  React.useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commit = React.useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename?.(next);
    else setDraft(title);
  }, [draft, onRename, title]);

  return (
    <header className={cn(styles.recordHeader, className)}>
      {mark ? (
        <span className={styles.recordMark}>{mark}</span>
      ) : Icon ? (
        <span className={styles.recordMark}>
          <Icon />
        </span>
      ) : null}

      <span className={styles.recordTitleGroup}>
        {editing && onRename ? (
          <input
            autoFocus
            className={styles.recordTitleInput}
            value={draft}
            aria-label={renameLabel}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h1 className={styles.recordTitle}>
            {onRename ? (
              // A real button, not a clickable heading: the title is the
              // larger of the two ways in, and it has to be reachable by
              // keyboard on its own.
              <button
                type="button"
                className={styles.recordTitleButton}
                onClick={() => setEditing(true)}
              >
                {title}
              </button>
            ) : (
              title
            )}
          </h1>
        )}

        {onRename && !editing ? (
          <button
            type="button"
            aria-label={renameLabel}
            className={styles.recordPencil}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </button>
        ) : null}

        {badge}
      </span>

      <span className={styles.recordActions}>
        {action}
        {overflow ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={overflowLabel}
                className={styles.iconButton}
              >
                <DotsThree />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{overflow}</DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {closeSurface ? (
          <>
            {/* The divider separates the record's verbs from the surface's
                close. A header with no verbs has nothing to separate, so it
                draws the × alone rather than a rule against the void. */}
            {action || overflow ? (
              <span aria-hidden="true" className={styles.headerDivider} />
            ) : null}
            <button
              type="button"
              aria-label={closeLabel}
              className={styles.iconButton}
              onClick={closeSurface}
            >
              <X />
            </button>
          </>
        ) : null}
      </span>
    </header>
  );
}

export type HeaderActionProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** A filled icon, drawn at 14px in `#565C69`. */
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * The header's one labelled verb: 32px, `#E5E8EE` border, `500 13/1.4`.
 *
 * Local rather than `components/ui/button.tsx` because the design system's
 * rungs are 24/30/36/44 and its secondary border is `#D2D7E0` — there is no
 * 32px rung with a `#E5E8EE` edge anywhere in it, and a 36px button in this
 * header sits a visible 2px proud of the 32px mark beside it.
 */
export function HeaderAction({
  icon: Icon,
  children,
  className,
  type,
  ...props
}: HeaderActionProps) {
  return (
    <button type={type ?? "button"} className={cn(styles.button, className)} {...props}>
      {Icon ? <Icon /> : null}
      {children}
    </button>
  );
}
