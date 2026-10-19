import { redirect } from "next/navigation";

import { bankingMovedTo } from "@/lib/books/moved";

/** Accounting → Banking moved to Books' Bank & cash (books-final §3.4): Accounts, each account's transactions, Reconciliations. */
export default async function AccountingBankingMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(bankingMovedTo(await searchParams));
}
