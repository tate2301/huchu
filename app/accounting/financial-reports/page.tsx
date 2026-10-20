import { redirect } from "next/navigation";

import { financialsMovedTo } from "@/lib/books/moved";

/** The Financial reports hub only linked to the statements, which have one page now: Books' Financial statements (books-final §3.4). The reports stay in Reports from Books. */
export default async function AccountingFinancialReportsMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(financialsMovedTo(await searchParams));
}
