import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { BrandingPage } from "../branding-page";

export const metadata: Metadata = { title: "Branding" };

/** Management → Branding, Identity and theme (PageBrandIdentity). */
export default async function BrandingIdentityPage() {
  await requirePreferencesAccess("branding");
  return <BrandingPage initialTab="identity" />;
}
