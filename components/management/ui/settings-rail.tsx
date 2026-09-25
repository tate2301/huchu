"use client";

import * as React from "react";
import Link from "next/link";

import { ArrowLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type SettingsRailItem = {
  /** Stable key. The nav item's own id is the obvious one. */
  id: string;
  label: string;
  /** Where it goes. Omit it and pass `onSelect` for a client-side switch. */
  href?: string;
  onSelect?: () => void;
  /**
   * A filled icon — rule 10. Any `@/lib/icons` export works; they default to
   * Phosphor's `fill` weight and take their size from the rail's stylesheet,
   * so pass the component, not an element.
   */
  icon: React.ComponentType<{ className?: string }>;
  /** Right-aligned, mono, tabular. Omit for an item that has nothing to count. */
  count?: number;
  /** An amber dot before the count: something in here needs attention. */
  attention?: boolean;
  /** Accessible name for the attention dot. */
  attentionLabel?: string;
  active?: boolean;
};

export type SettingsRailGroup = {
  id: string;
  /**
   * Sentence case, never uppercase: "People", "Operations", "Compliance",
   * "Company", "School", "My account".
   */
  label: string;
  items: SettingsRailItem[];
};

export type SettingsRailProps = {
  groups: SettingsRailGroup[];
  /** Where the back button goes. Pass one of `backHref` / `onBack`. */
  backHref?: string;
  onBack?: () => void;
  /** Default: "Back to the app". */
  backLabel?: string;
  /** The wordmark at the top. Default: "Settings". */
  title?: string;
  className?: string;
};

/**
 * The settings rail: a breadcrumb back to the app, then grouped destinations.
 *
 * Three deliberate decisions, all visible in `Rail.dc.html` and `Main.dc.html`:
 *
 *   - **No workspace switcher.** The old rail carried one; the board does not.
 *     A settings surface is already inside one workspace.
 *   - **Bold sentence-case group headings.** The design system's
 *     `.group-label` is 12px uppercase `#8A91A0`, which reads as a form legend
 *     rather than a heading and fails 4.5:1. These are `600 15px/1.35 #16181D`
 *     — `Rail.dc.html`'s value, and the ladder's section-heading rung. The two
 *     boards disagree here and `Rail.dc.html` wins: `Main.dc.html` puts the
 *     wordmark on the 17px page-title rung and drops its group headings to
 *     13px, which both outweighs the record title beside it and flattens the
 *     headings into the items under them. The rail keeps 15/1.3 for the
 *     wordmark and 15/1.35 for the headings, one rung apart from the 13px
 *     items.
 *   - **A grey active row, no edge bar.** `globals.css` paints `.rail-item`'s
 *     active state with a 2px brand `::before` and `--surface-muted`. The
 *     board is `#E8EBF0` and nothing else.
 *
 * Those three are why this is plain markup rather than `NavRail` /
 * `NavRailItem`: the rail stylesheet disagrees with the board on height,
 * weight, gap, ink and the marker, and overriding five properties per item
 * from a call site is how the drift got there in the first place. `NavRail`
 * stays the right primitive for every other module's rail.
 *
 * **Grouping is a prop, not a lookup.** This component never reads a nav table
 * and never applies a gate. The caller filters `lib/settings/management-nav.ts`
 * and `lib/preferences/nav.ts` through their own predicates and hands over what
 * survived, so no permission decision moves into presentation.
 */
export function SettingsRail({
  groups,
  backHref,
  onBack,
  backLabel = "Back to the app",
  title = "Settings",
  className,
}: SettingsRailProps) {
  return (
    <nav aria-label={title} className={cn(styles.rail, className)}>
      <div className={styles.railHead}>
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            className={cn(styles.iconButton, styles.railBack)}
          >
            <ArrowLeft />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className={cn(styles.iconButton, styles.railBack)}
          >
            <ArrowLeft />
          </button>
        )}
        <h1 className={styles.railTitle}>{title}</h1>
      </div>

      <div className={styles.railBody}>
        {groups.map((group) => (
          <div key={group.id} className={styles.railGroup}>
            <h2 className={styles.railGroupLabel}>{group.label}</h2>
            {group.items.map((item) => (
              <RailItem key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

function RailItem({ item }: { item: SettingsRailItem }) {
  const Icon = item.icon;

  const body = (
    <>
      <Icon />
      <span className={styles.railLabel}>{item.label}</span>
      {item.attention ? (
        <span
          className={styles.railAttention}
          role="img"
          aria-label={item.attentionLabel ?? "Needs attention"}
        />
      ) : null}
      {typeof item.count === "number" ? (
        <span className={styles.railCount}>{item.count}</span>
      ) : null}
    </>
  );

  // `aria-current` carries the active styling as well as the semantics, so a
  // row cannot look selected without announcing that it is.
  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        className={styles.railItem}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={item.onSelect}
      aria-current={item.active ? "true" : undefined}
      className={styles.railItem}
    >
      {body}
    </button>
  );
}
