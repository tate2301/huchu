import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/**
 * Any other old Accounting address (a deep link the pages above never had)
 * forwards to Books, so nothing under `/accounting` renders (books-final §8 P5).
 */
export default async function AccountingAnyMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(movedTo("/books", await searchParams));
}
