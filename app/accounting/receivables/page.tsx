import { redirect } from "next/navigation";

import { receivablesMovedTo } from "@/lib/books/moved";

/** The Receivables hub moved: who owes what, by age, is Books → Customers → By age; its tiles are Money's (books-final §3.4). */
export default async function AccountingReceivablesMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(receivablesMovedTo(await searchParams));
}
