import { redirect } from "next/navigation";

import { purchasesMovedTo } from "@/lib/books/moved";

/**
 * Accounting → Purchases moved to Books' Bills & spending level (books-final
 * §3.4): bills, supplier payments, suppliers, debit notes, write-offs, aging
 * and statements each have their Books page, and `?view=` and `?action=new-*`
 * land on the matching tab, form or drawer.
 */
export default async function AccountingPurchasesMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(purchasesMovedTo(await searchParams));
}
