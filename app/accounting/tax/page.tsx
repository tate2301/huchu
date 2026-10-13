import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** VAT returns moved to Books (`/books/vat`), where the boards put it; this address forwards there. */
export default async function AccountingTaxMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(movedTo("/books/vat", await searchParams));
}
