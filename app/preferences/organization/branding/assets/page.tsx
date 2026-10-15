import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { BrandingPage } from "../branding-page";

export const metadata: Metadata = { title: "Branding" };

/** Management → Branding, Assets and contact (PageBrandAssets). */
export default async function BrandingAssetsPage() {
  await requirePreferencesAccess("branding");
  return <BrandingPage initialTab="assets" />;
}
