import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** Invoices are Books' records, at one address (design/books/NOTES.md §2). */
export default async function CrmInvoicesMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(movedTo("/books/invoices", await searchParams));
}
