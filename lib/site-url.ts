// Canonical site URL helpers.
//
// Split out of `lib/marketing/seo.ts`: the root layout needs `getSiteUrl()` for
// `metadataBase`, and while it lived in seo.ts the layout's compile closure
// included the marketing pricing tables (seo.ts imports MARKETING_TIERS for
// JSON-LD). This module depends on platform brand constants only.
import { PLATFORM_MARKETING_DOMAIN } from "@/lib/platform/brand";

export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");

  const raw = configured || `https://${PLATFORM_MARKETING_DOMAIN}`;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  return withProtocol.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalized}`;
}
