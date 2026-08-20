"use client";

import { useSyncExternalStore, type ReactNode } from "react";

export type ClientDateMode = "datetime" | "date";

export type ClientDateProps = {
  /** ISO 8601 timestamp. `null`/`undefined`/unparseable renders `fallback`. */
  value: string | null | undefined;
  /** `date` renders the day only, `datetime` adds the time. @default 'datetime' */
  mode?: ClientDateMode;
  /** Rendered when there is no usable value. @default '—' */
  fallback?: ReactNode;
};

const NO_RESUBSCRIBE = () => () => {};

/**
 * A timestamp in the reader's locale, without breaking hydration.
 *
 * Two invariants, because 39 files drop this inline inside table cells and
 * text runs:
 *
 *   1. It returns a **bare fragment**, never a wrapper element — no `<span>`,
 *      no class hook — so it never disturbs the layout of the cell or the
 *      sentence it sits in.
 *   2. Before mount it emits a **string slice of the raw ISO input**
 *      (`slice(0, 10)` for `date`, `slice(0, 16)` with the `T` swapped for
 *      `datetime`). Nothing derived from `new Date()` reaches the first paint,
 *      so the server bytes and the first client render match and React
 *      hydration error #418 stays away.
 *
 * This began as a straight re-export of `@corelithzw/react`'s `ClientDate`,
 * which holds both invariants — but its `datetime` renders through
 * `toLocaleString()`, and that carries **seconds**. On a record page that
 * means "8/4/2026, 9:06:53 PM" beside every quote, comment and logged call: a
 * precision nobody asked for, in a column narrow enough that it wraps to buy
 * it. So the formatting is spelled out here and the seconds are dropped.
 * Anything needing them should format explicitly at the call site rather than
 * putting them back for every reader of every table.
 *
 * `"use client"` is load-bearing: this module is what marks the hook use as a
 * client reference for the server components that import it.
 */
export function ClientDate({ value, mode = "datetime", fallback = "—" }: ClientDateProps) {
  const hydrated = useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => true,
    () => false,
  );

  if (!value) return <>{fallback}</>;

  if (!hydrated) {
    return <>{mode === "date" ? value.slice(0, 10) : value.slice(0, 16).replace("T", " ")}</>;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{fallback}</>;

  if (mode === "date") return <>{date.toLocaleDateString()}</>;

  return (
    <>
      {date.toLocaleDateString()},{" "}
      {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </>
  );
}
