import { redirect } from "next/navigation";

import { costCentresMovedTo } from "@/lib/books/moved";

/** Accounting → Cost centres moved to Books' Ledger (`/books/cost-centres`, books-final §3.4). */
export default async function AccountingCostCentresMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(costCentresMovedTo(await searchParams));
}
