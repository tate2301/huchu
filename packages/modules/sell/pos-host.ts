import { buildPortalHost } from "@corelithzw/platform/portal-hosts";

export const POS_PUBLIC_PATHS = [
  "/",
  "/login",
  "/overview",
  "/held",
  "/history",
  "/reports",
  "/shift",
  /**
   * S-7.3 · S-7.4 · S-7.6 — the last surfaces the POS prototype puts on the till.
   *
   * `/offline` was `/queue`, which named a route that does not exist: the page
   * is `app/portal/pos/offline/page.tsx` and the nav rail links to `/offline`.
   * A path missing from this list does not 404 on the POS host — it falls
   * through to checkout, so the cashier presses Offline and lands on the sell
   * screen with no indication anything went wrong. `/help` was missing outright
   * and did exactly that.
   */
  "/offline",
  "/settings",
  "/activity",
  "/help",
] as const;
export const POS_OPTIONAL_PUBLIC_PATHS = ["/customers", "/price-check"] as const;
export const POS_ALL_PUBLIC_PATHS = [...POS_PUBLIC_PATHS, ...POS_OPTIONAL_PUBLIC_PATHS] as const;

export type PosPortalPath = (typeof POS_ALL_PUBLIC_PATHS)[number];
export type PosPortalNavKey =
  | "checkout"
  | "held"
  | "history"
  | "reports"
  | "shift"
  | "overview"
  | "customers"
  | "price-check"
  | "offline"
  | "settings"
  | "activity"
  | "help";

const POS_PORTAL_HREFS: Record<PosPortalNavKey, { publicHref: string | null; internalHref: string }> = {
  checkout: { publicHref: "/", internalHref: "/portal/pos" },
  held: { publicHref: "/held", internalHref: "/portal/pos/held" },
  history: { publicHref: "/history", internalHref: "/portal/pos/history" },
  reports: { publicHref: "/reports", internalHref: "/portal/pos/reports" },
  shift: { publicHref: "/shift", internalHref: "/portal/pos/shift" },
  // `/overview` is in `POS_PUBLIC_PATHS` and the rail links to it, so a null
  // public href here would have sent anyone using `getPosPortalHref` to the
  // internal path on the POS host. Nothing does today; it was a trap regardless.
  overview: { publicHref: "/overview", internalHref: "/portal/pos/overview" },
  customers: { publicHref: "/customers", internalHref: "/portal/pos/customers" },
  "price-check": { publicHref: "/price-check", internalHref: "/portal/pos/price-check" },
  offline: { publicHref: "/offline", internalHref: "/portal/pos/offline" },
  settings: { publicHref: "/settings", internalHref: "/portal/pos/settings" },
  activity: { publicHref: "/activity", internalHref: "/portal/pos/activity" },
  help: { publicHref: "/help", internalHref: "/portal/pos/help" },
};

const POS_PORTAL_ALLOWED_ROLES = new Set(["CASHIER", "POS_CASHIER"]);

export function isCashierRole(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim().toUpperCase();
  return normalizedRole === "CASHIER" || normalizedRole === "POS_CASHIER";
}

export function canAccessPosPortal(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim().toUpperCase();
  if (!normalizedRole) {
    return false;
  }

  return POS_PORTAL_ALLOWED_ROLES.has(normalizedRole);
}

export function isPublicPosPath(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }

  return POS_ALL_PUBLIC_PATHS.some(
    (allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`),
  );
}

export function normalizePosCallbackUrl(
  callbackUrl: string | null | undefined,
  fallbackPath: string,
): string {
  if (!callbackUrl) {
    return fallbackPath;
  }

  const normalized = callbackUrl.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallbackPath;
  }

  if (normalized === "/login") {
    return fallbackPath;
  }

  return isPublicPosPath(normalized) ? normalized : fallbackPath;
}

export function getPosHostForCompany(companySlug: string | null | undefined, rootDomain: string | null | undefined) {
  const normalizedCompanySlug = companySlug?.trim().toLowerCase();
  const normalizedRootDomain = rootDomain?.trim().toLowerCase();

  if (!normalizedCompanySlug || !normalizedRootDomain) {
    return null;
  }

  return buildPortalHost("pos", normalizedCompanySlug, normalizedRootDomain);
}

export function getPosPortalHref(key: PosPortalNavKey, isPosHost: boolean): string {
  const href = POS_PORTAL_HREFS[key];
  return isPosHost ? href.publicHref ?? href.internalHref : href.internalHref;
}

export function getPosPortalHrefPair(key: PosPortalNavKey) {
  return POS_PORTAL_HREFS[key];
}
