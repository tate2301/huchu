import { redirect } from "next/navigation";

import { currencyMovedTo } from "@/lib/books/moved";

/** Accounting → Currency moved to Books' Close the month › Rates & revaluation (books-final §3.4). */
export default async function AccountingCurrencyMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(currencyMovedTo(await searchParams));
}
