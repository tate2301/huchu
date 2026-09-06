"use client";

import type { ReactNode } from "react";

import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The one line under a page's name that carries what changes.
 *
 * The canvas law is that a page is named once, in the app bar, and that the
 * caption beneath it stops explaining the title and starts carrying state —
 * "Term 2 · 118 on the roll", "1,106 on file · 61 not invited", "Students ·
 * 118 rows". Where nothing changes there is no caption, which is most pages.
 *
 * It is not the page band. The band's chips are individually addressable
 * numbers with tones, sticky at the top of the scroll; this is a sentence, sits
 * once under the title, and scrolls away with it. A record page — a pupil, a
 * guardian, a teacher — has no numbers worth a chip and this is all it needs.
 */
export function PageCaption({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "-mt-1 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
