import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type SectionHeadingProps = {
  children: React.ReactNode;
  /**
   * A filled icon for the 24px tile.
   *
   * Optional, and absent means no tile at all rather than an empty one.
   * `Account.dc.html`, `Notifications.dc.html` and the other form boards draw
   * Details, Workspace, Password, Email and In the app as bare headings — a
   * tile there would be decoration, which rule 10 does not allow, and
   * requiring the prop only pushed call sites into picking an icon that meant
   * nothing.
   */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * `brand` (tint `#E8EFFE`, glyph `#0944C2`) marks the record's **own** detail
   * section — the one section that is the record rather than something hanging
   * off it. Everything else is `neutral`. One brand tile per record.
   */
  tone?: "brand" | "neutral";
  /** Rule 7: a heading over a list carries its count. */
  count?: number;
  /** Rule 2: the list's verb, right-aligned to the list's own right edge. */
  action?: React.ReactNode;
  /** Records use `30px 0 10px`; form pages use `36px 0 12px`. */
  variant?: "record" | "form";
  /** The width the heading row aligns to. Default 470, matching the lists. */
  maxWidth?: number;
  className?: string;
};

/**
 * A section heading: tile, heading, count, spacer, the section's own action.
 *
 * The row is capped at 470px so the action lands on the list's right edge
 * rather than the record column's — a verb floating at the far side of a wide
 * window is a verb that looks like it belongs to the page.
 *
 * A heading with neither a count nor an action is drawn bare, with 12px under
 * it rather than 10 — the boards give a plain "Details" or "Activity" that
 * extra 2px because there is no control on the row to fill the gap.
 *
 * The tile is drawn only when there is an icon to put in it. The form boards
 * draw their section headings as type alone.
 */
export function SectionHeading({
  children,
  icon: Icon,
  tone = "neutral",
  count,
  action,
  variant = "record",
  maxWidth = 470,
  className,
}: SectionHeadingProps) {
  const bare = typeof count !== "number" && !action;

  return (
    <div
      data-variant={variant}
      data-bare={bare ? "true" : "false"}
      style={{ maxWidth }}
      className={cn(styles.sectionHeading, className)}
    >
      <h3 className={styles.sectionHeadingText}>
        {Icon ? (
          <span data-tone={tone} className={styles.sectionTile}>
            <Icon />
          </span>
        ) : null}
        {children}
      </h3>
      {typeof count === "number" ? (
        <span className={styles.sectionCount}>{count}</span>
      ) : null}
      {action ? (
        <>
          <span className={styles.spacer} />
          {action}
        </>
      ) : null}
    </div>
  );
}

export type SectionActionProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * The 28px button that belongs to one section rather than to the record.
 *
 * One rung below `HeaderAction` on purpose: it sits against a 15px heading,
 * not a 17px title, and at 32px it competes with the record's own verb for
 * which one the page is about.
 */
export function SectionAction({
  icon: Icon,
  children,
  className,
  type,
  ...props
}: SectionActionProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(styles.button, styles.buttonSection, className)}
      {...props}
    >
      {Icon ? <Icon /> : null}
      {children}
    </button>
  );
}
