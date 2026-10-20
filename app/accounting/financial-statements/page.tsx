import { redirect } from "next/navigation";

import { financialsMovedTo } from "@/lib/books/moved";

/** Accounting → Financial statements moved to Books' Ledger (`/books/financials`, books-final §3.4), on the statement it named. */
export default async function AccountingFinancialStatementsMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(financialsMovedTo(await searchParams));
}
