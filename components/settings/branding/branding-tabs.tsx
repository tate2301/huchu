"use client";

import Link from "next/link";

import styles from "./branding.module.css";

export type BrandingSection = "identity" | "assets" | "finance";

/**
 * The three sections of one record.
 *
 * Three routes, one company brand — so these are links, not a client-side
 * switch, and every board draws them on their own row directly under the title
 * line. The `blurb` the old in-page rail carried under each label is gone:
 * rule 1, a control that needs explaining is named wrong.
 */
export const BRANDING_SECTIONS: Array<{
  id: BrandingSection;
  label: string;
  href: string;
}> = [
  {
    id: "identity",
    label: "Identity & Theme",
    href: "/preferences/organization/branding/identity",
  },
  {
    id: "assets",
    label: "Assets & Contact",
    href: "/preferences/organization/branding/assets",
  },
  {
    id: "finance",
    label: "Finance & Defaults",
    href: "/preferences/organization/branding/finance",
  },
];

/**
 * `aria-current="page"` is what drives the selected tint, so a tab cannot look
 * selected without announcing that it is.
 */
export function BrandingTabs({ section }: { section: BrandingSection }) {
  return (
    <nav aria-label="Branding sections" className={styles.tabs}>
      {BRANDING_SECTIONS.map((entry) => (
        <Link
          key={entry.id}
          href={entry.href}
          aria-current={entry.id === section ? "page" : undefined}
          className={styles.tab}
        >
          {entry.label}
        </Link>
      ))}
    </nav>
  );
}
