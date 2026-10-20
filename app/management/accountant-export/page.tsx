import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { AccountantExportSettings } from "./accountant-export-settings";

export const metadata: Metadata = { title: "Accountant export" };

/** Management → Company → Accountant export (books-final §3.2 "In Management"): Books' core, free on every plan. */
export default async function AccountantExportPage() {
  await requirePreferencesAccess("accountant-export");
  return <AccountantExportSettings />;
}
