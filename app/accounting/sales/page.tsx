import { redirect } from "next/navigation";

import { salesMovedTo } from "@/lib/books/moved";

/**
 * Accounting → Sales moved to Books' Sales level (books-final §3.4): invoices,
 * customers, payments received, credit notes and write-offs each have their
 * Books page, and `?view=` and `?action=new-*` land on the matching tab or form.
 */
export default async function AccountingSalesMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(salesMovedTo(await searchParams));
}
