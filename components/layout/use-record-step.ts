"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { parseSequence, SEQUENCE_KEY, stepAt, type Step } from "@/lib/nav/sequence";

const typing = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

/**
 * Where the record on screen stands among the records of the list it was
 * opened from, and the keys that move along them: J for the next, K for the
 * previous. Null when the record was opened any other way, or `enabled` is
 * false (the page is not a record).
 */
export function useRecordStep(enabled: boolean): (Step & { previous: (() => void) | null; next: (() => void) | null }) | null {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [step, setStep] = React.useState<Step | null>(null);

  // Read after mount: the server has no sessionStorage.
  React.useEffect(() => {
    if (!enabled) {
      setStep(null);
      return;
    }
    try {
      setStep(stepAt(parseSequence(window.sessionStorage.getItem(SEQUENCE_KEY)), pathname));
    } catch {
      setStep(null);
    }
  }, [enabled, pathname]);

  const prevHref = step?.prevHref ?? null;
  const nextHref = step?.nextHref ?? null;
  const previous = React.useMemo(() => (prevHref ? () => router.push(prevHref) : null), [prevHref, router]);
  const next = React.useMemo(() => (nextHref ? () => router.push(nextHref) : null), [nextHref, router]);

  React.useEffect(() => {
    if (!step) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || typing(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const key = event.key.toLowerCase();
      if (key === "j" && next) {
        event.preventDefault();
        next();
      } else if (key === "k" && previous) {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, next, previous]);

  return step ? { ...step, previous, next } : null;
}
