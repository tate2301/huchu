import { redirect } from "next/navigation";

import { postingRulesMovedTo } from "@/lib/books/moved";

/** The posting studio moved to Books' Ledger (`/books/posting-rules`, books-final §3.4): its failures are Needs posting, its seed is Set up the books. */
export default async function AccountingPostingRulesMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(postingRulesMovedTo(await searchParams));
}
