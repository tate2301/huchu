"use client";

import { useSyncExternalStore } from "react";

/** Never resubscribes: the answer changes once, at hydration, and never again. */
const NO_RESUBSCRIBE = () => () => {};

/**
 * False on the server and on the first client paint, true forever after.
 *
 * The one honest way to ask "may I use something the server could not know?" —
 * the reader's locale, their clock, what is in their `localStorage`. Rendering
 * any of those on the first paint is React hydration error #418, because the
 * server rendered something else.
 *
 * ## Why `useSyncExternalStore` and not a mount effect
 *
 * `const [m, setM] = useState(false); useEffect(() => setM(true), [])` does the
 * same job and is what most of this codebase reached for. It is also what
 * `react-hooks/set-state-in-effect` refuses, and the rule is right: a setState
 * in an effect is a second render pass that React cannot see coming, so the
 * compiler gives up on the component and memoizes nothing in it.
 *
 * `useSyncExternalStore` says the same thing in the form React is built to
 * understand — a server snapshot of `false`, a client snapshot of `true`, and
 * no subscription because nothing will change again. No extra render, nothing
 * for the compiler to bail on.
 *
 * `components/ui/client-date.tsx` worked this out first and lints clean while
 * its siblings did not; this is that pattern with a name on it.
 *
 * ## Using it
 *
 * Return the same bytes the server sent until it is true:
 *
 *   const hydrated = useHydrated()
 *   if (!hydrated) return <>{value.slice(0, 10)}</>   // raw ISO, both sides
 *   return <>{new Date(value).toLocaleDateString()}</>
 *
 * `"use client"` is load-bearing: it is what marks the hook as a client
 * reference for the server components that import a consumer of it.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => true,
    () => false,
  );
}
