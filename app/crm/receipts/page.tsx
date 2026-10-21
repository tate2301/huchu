import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** Receipts are Books' payments received, at one address (design/books/NOTES.md §2). */
export default async function CrmReceiptsMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(movedTo("/books/payments", await searchParams));
}
