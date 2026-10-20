import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { MoneyAccountsSettings } from "./money-accounts-settings";

export const metadata: Metadata = { title: "Money accounts" };

/** Management → Company → Money accounts (books-final §3.2 "In Management"): Books' core, free on every plan. */
export default async function MoneyAccountsPage() {
  await requirePreferencesAccess("money-accounts");
  return <MoneyAccountsSettings />;
}
