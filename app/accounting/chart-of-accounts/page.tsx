import { redirect } from "next/navigation";

import { chartMovedTo } from "@/lib/books/moved";

/** Accounting → Chart of accounts moved to Books' Ledger (`/books/chart`, books-final §3.4); `?action=new-account` opens New account there. */
export default async function AccountingChartMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(chartMovedTo(await searchParams));
}
