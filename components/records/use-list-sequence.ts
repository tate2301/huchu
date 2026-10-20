"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { writeSequence } from "@/lib/nav/sequence";

/**
 * Tells the app which records this list is showing, in order, so a record
 * opened from it can step to the next one. Called by the shared record list
 * and table; a list of something else never calls it.
 */
export function useListSequence(hrefs: ReadonlyArray<string | null | undefined>, total?: number) {
  const pathname = usePathname() ?? "";
  const query = useSearchParams()?.toString() ?? "";
  // By value: a fresh array each render must not rewrite storage each render.
  const key = hrefs.filter(Boolean).join("\n");
  React.useEffect(() => {
    if (!key) return;
    writeSequence(window.sessionStorage, {
      from: query ? `${pathname}?${query}` : pathname,
      hrefs: key.split("\n"),
      total,
    });
  }, [key, pathname, query, total]);
}
