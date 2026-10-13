import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** Journals moved to Books (`/books/journals`), where the boards put it; this address forwards there. */
export default async function AccountingJournalsMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(movedTo("/books/journals", await searchParams));
}
