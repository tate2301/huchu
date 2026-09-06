"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { useRecordPeek } from "@/components/records/record-peek";
import { useRecordTrail } from "@/components/records/record-trail";
import { parseRecordHref } from "@/lib/crm/record-ref";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A named reference to another record.
 *
 * Detail pages are mostly made of other records — a deal names a company, a
 * site, the people on it, whoever owns it. Those were plain text, so the page
 * told you the name and then made you go and find it. Every one of them is now
 * the way there.
 *
 * Underlined, not just coloured. A colour shift alone is easy to miss against
 * a page of near-black text, and on a screen in daylight on a site it is
 * invisible; the underline is the part that says "this goes somewhere" without
 * relying on anyone noticing a hue.
 *
 * ## What a click does
 *
 * Two different questions get asked of the same link, and they want different
 * answers:
 *
 *   - *what is this?* — which company, has that site got an address, is that
 *     the person we spoke to. A journey is the wrong price for a glance, so a
 *     plain click **peeks**: the record opens beside the page and the page
 *     does not move.
 *   - *take me there* — which is what the modifier keys have always meant.
 *     ⌘/ctrl-click, shift-click and middle-click are left entirely alone, so
 *     "open in a new tab" works the way it does everywhere else.
 *
 * And when navigation does happen — from the peek's own **Open full page**, or
 * from a link that points somewhere the peek cannot summarise — the record
 * being left is pushed onto the trail, so the next page's back arrow names it
 * instead of a list nobody has been near.
 *
 * `peek={false}` opts a call site out, for a reference that is the point of
 * the row rather than an aside.
 */
export function EntityLink({
  href,
  children,
  className,
  muted,
  peek = true,
}: {
  /** Where the record lives. Pass null for a reference with no page yet. */
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
  /** For references in supporting text, which should not shout. */
  muted?: boolean;
  /** Set false where a click should go straight there. */
  peek?: boolean;
}) {
  const { open } = useRecordPeek();
  const { current, follow } = useRecordTrail();

  if (!href) {
    return <span className={className}>{children}</span>;
  }

  const target = parseRecordHref(href);
  const peekable = peek && Boolean(target);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Everything the browser already does for a link, it keeps doing. A new
    // tab is a deliberate act and none of our business.
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    // A reference to the record you are already reading is not a journey and
    // not worth a panel either.
    if (current && current.href === href) {
      event.preventDefault();
      return;
    }

    if (peekable && open(href)) {
      event.preventDefault();
      return;
    }

    if (current) follow(current);
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]",
        muted ? "text-[var(--text-muted)] hover:text-[var(--text)]" : "hover:text-[var(--text)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
