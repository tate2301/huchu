import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { MoneyAndTaxSettings } from "./money-and-tax-settings";

export const metadata: Metadata = { title: "Money and tax" };

/** Management → Company → Money and tax (books-final §3.2 "In Management"): Books' core, free on every plan. */
export default async function MoneyAndTaxPage() {
  await requirePreferencesAccess("money-and-tax");
  return <MoneyAndTaxSettings />;
}
