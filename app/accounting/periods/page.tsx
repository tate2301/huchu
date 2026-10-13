import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** Periods moved to Books (`/books/periods`), where the boards put it; this address forwards there. */
export default async function AccountingPeriodsMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(movedTo("/books/periods", await searchParams));
}
