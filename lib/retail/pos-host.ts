import { buildPortalHost } from "@/lib/platform/portal-hosts";

export const POS_PUBLIC_PATHS = ["/", "/login", "/held", "/history", "/shift"] as const;
export const POS_OPTIONAL_PUBLIC_PATHS = ["/customers", "/price-check"] as const;
export const POS_ALL_PUBLIC_PATHS = [...POS_PUBLIC_PATHS, ...POS_OPTIONAL_PUBLIC_PATHS] as const;

export type PosPortalPath = (typeof POS_ALL_PUBLIC_PATHS)[number];
export type PosPortalNavKey =
  | "checkout"
  | "held"
  | "history"
  | "shift"
  | "overview"
  | "customers"
  | "price-check";

const POS_PORTAL_HREFS: Record<PosPortalNavKey, { publicHref: string | null; internalHref: string }> = {
  checkout: { publicHref: "/", internalHref: "/portal/pos" },
  held: { publicHref: "/held", internalHref: "/portal/pos/held" },
  history: { publicHref: "/history", internalHref: "/portal/pos/history" },
  shift: { publicHref: "/shift", internalHref: "/portal/pos/shift" },
  overview: { publicHref: null, internalHref: "/portal/pos/overview" },
  customers: { publicHref: "/customers", internalHref: "/portal/pos/customers" },
  "price-check": { publicHref: "/price-check", internalHref: "/portal/pos/price-check" },
};

export function isCashierRole(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim().toUpperCase();
  return normalizedRole === "CASHIER" || normalizedRole === "POS_CASHIER";
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
