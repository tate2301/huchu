import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/**
 * The Accounting overview is retired (books-final §3.4, §8 P5): Money does its
 * job, and the seed pack is Books › Settings › Set up the books. This address
 * forwards to Books.
 */
export default async function AccountingMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(movedTo("/books", await searchParams));
}
