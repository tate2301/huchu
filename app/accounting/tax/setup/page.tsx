import { redirect } from "next/navigation";

import { taxSetupMovedTo } from "@/lib/books/moved";

/** Accounting → Tax setup moved to Books' Settings › Tax codes & rules (books-final §3.2). */
export default async function AccountingTaxSetupMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(taxSetupMovedTo(await searchParams));
}
