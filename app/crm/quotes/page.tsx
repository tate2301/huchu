import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** Quotes are Books' records, at one address (design/books/NOTES.md §2). */
export default async function CrmQuotesMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(movedTo("/books/quotes", await searchParams));
}
