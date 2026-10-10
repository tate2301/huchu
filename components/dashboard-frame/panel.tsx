import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Panel (span n): a 48px head on `--ground` — the title, then a count pill
 * ("Needs action 6", crimson) or a quiet qualifier ("last 30 days"), and on
 * the right a link or a figure — over its body. A panel with nothing to show
 * says so ("Nothing yet today.").
 */
export function Panel({
  title,
  count,
  qualifier,
  link,
  figure,
  span,
  empty,
  className,
  children,
}: {
  title: string;
  count?: { value: React.ReactNode; tone?: "bad" | null } | null;
  qualifier?: string | null;
  link?: { href: string; label: string } | null;
  figure?: string | null;
  span?: number;
  /** Replaces the body when set. */
  empty?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("cx-df-panel", span ? `cx-df-span-${span}` : undefined, className)}>
      <div className="cx-df-panel__head">
        <h2 id={id}>{title}</h2>
        {count ? (
          <span className={cn("cx-df-panel__count", count.tone === "bad" && "cx-df-panel__count--bad")}>{count.value}</span>
        ) : null}
        {qualifier ? <span className="cx-df-tone-muted">{qualifier}</span> : null}
        <span style={{ flex: 1 }} />
        {link ? (
          <Link href={link.href} className="cx-df-link">
            {link.label}
          </Link>
        ) : null}
        {figure ? <span className="cx-df-panel__figure">{figure}</span> : null}
      </div>
      {empty ? <p className="cx-df-panel__empty">{empty}</p> : children}
    </section>
  );
}
