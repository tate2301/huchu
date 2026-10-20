import { redirect } from "next/navigation";

import { trialBalanceMovedTo } from "@/lib/books/moved";

/** Accounting → Trial balance moved to Books' Ledger (`/books/trial-balance`, books-final §3.4); a date range stays a range. */
export default async function AccountingTrialBalanceMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(trialBalanceMovedTo(await searchParams));
}
