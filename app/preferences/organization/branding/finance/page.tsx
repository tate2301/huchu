import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { BrandingPage } from "../branding-page";

export const metadata: Metadata = { title: "Branding" };

/** Management → Branding, Finance and defaults (PageBrandFinance). */
export default async function BrandingFinancePage() {
  await requirePreferencesAccess("branding");
  return <BrandingPage initialTab="finance" />;
}
