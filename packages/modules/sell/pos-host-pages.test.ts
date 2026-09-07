/**
 * Every door in the till's nav has to open.
 *
 * ── The bug this exists to stop happening again ────────────────────────────
 *
 * On the POS host the portal is served from the root, and `POS_PUBLIC_PATHS`
 * is the list of roots that resolve. A path missing from it **does not 404** —
 * it falls through to checkout. So a cashier presses "Help", the sell screen
 * appears, and nothing anywhere reports a problem.
 *
 * That is exactly what shipped on 2026-08-17. `/help` was never added, and
 * `/offline` was in the list under the name `/queue` — a route that has no page
 * at all (`app/portal/pos/offline/page.tsx` is the real one). Two of the twelve
 * nav destinations quietly went to checkout, and it was only caught by looking
 * at a screenshot of the help screen and seeing a keypad.
 *
 * Typecheck cannot see any of this: the href map and the path list are separate
 * literals that happen to need to agree, and the page files are a third thing
 * again. So it is asserted here — including against the filesystem, because a
 * href pointing at a route nobody built is the same failure wearing a hat.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  POS_ALL_PUBLIC_PATHS,
  getPosPortalHrefPair,
  type PosPortalNavKey,
} from "./pos-host";

/** Every key in the href map. Kept explicit so adding one fails here first. */
const NAV_KEYS: PosPortalNavKey[] = [
  "checkout",
  "held",
  "history",
  "reports",
  "shift",
  "overview",
  "customers",
  "price-check",
  "offline",
  "settings",
  "activity",
  "help",
];

const PACKAGE_ROOT = __dirname;

describe("every POS nav destination resolves on the POS host", () => {
  it.each(NAV_KEYS)("%s has a public path the host will route", (key) => {
    const { publicHref } = getPosPortalHrefPair(key);
    expect(publicHref, `${key} has no public href`).not.toBeNull();
    expect(
      POS_ALL_PUBLIC_PATHS as readonly string[],
      `${publicHref} is missing from POS_PUBLIC_PATHS, so the POS host silently serves checkout instead`,
    ).toContain(publicHref);
  });
});

describe("every POS nav destination has a page behind it", () => {
  it.each(NAV_KEYS)("%s points at a route that exists", (key) => {
    const { internalHref } = getPosPortalHrefPair(key);
    // `/portal/pos/held` → `pages/portal/pos/held/page.tsx`; the root is `pages/portal/pos/page.tsx`.
    const pagePath = join(PACKAGE_ROOT, "pages", `${internalHref.replace(/^\//, "")}`, "page.tsx");
    expect(existsSync(pagePath), `${internalHref} has no page at ${pagePath}`).toBe(true);
  });
});

describe("the public path list has nothing dangling in it", () => {
  it("names no path that no nav entry points at", () => {
    const claimed = new Set(
      NAV_KEYS.map((key) => getPosPortalHrefPair(key).publicHref).filter(
        (href): href is string => href !== null,
      ),
    );
    // `/login` is reachable without a nav entry, by definition.
    const orphans = (POS_ALL_PUBLIC_PATHS as readonly string[]).filter(
      (path) => path !== "/login" && !claimed.has(path),
    );
    expect(
      orphans,
      "a public path no nav entry uses is either dead or a rename that only got done on one side — `/queue` was both",
    ).toEqual([]);
  });
});
