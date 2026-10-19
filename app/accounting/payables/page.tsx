import { redirect } from "next/navigation";

import { payablesMovedTo } from "@/lib/books/moved";

/** Accounting → Payables moved to Books' Suppliers, by age (books-final §3.4): the hub's tiles are Money's. */
export default async function AccountingPayablesMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(payablesMovedTo(await searchParams));
}
