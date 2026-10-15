"use client";

import "./features.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type SectionTab = { href: string; label: string };

/**
 * A page's own tabs, on their own row under its header: one subject each,
 * each its own address. The first is the page's own address; the others sit
 * under it. The list a tab shows draws its tabs and filters below.
 */
export function SectionTabs({ label, items }: { label: string; items: SectionTab[] }) {
  const pathname = usePathname();
  const first = items[0]?.href;
  return (
    <nav aria-label={label} className="cx-tabs cx-section-tabs">
      {items.map((item) => {
        const current = item.href === first ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className="cx-tab" aria-current={current ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A page with section tabs: its list fills what is left under the header and the tabs. */
export function Sectioned({ children }: { children: ReactNode }) {
  return <div className="cx-admin-sectioned">{children}</div>;
}
