import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { BrandWherePage } from "./where-page";

export const metadata: Metadata = { title: "Where your brand shows" };

/** Management → Branding → Where it shows (PageBrandWhere). */
export default async function BrandingWherePage() {
  await requirePreferencesAccess("branding");
  return <BrandWherePage />;
}
