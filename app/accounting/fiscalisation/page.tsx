import { redirect } from "next/navigation";

import { fiscalisationMovedTo } from "@/lib/books/moved";

/** Accounting → Fiscalisation moved to Books' Tax › Fiscal register; the device is set up in Management (books-final §3.2). */
export default async function AccountingFiscalisationMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(fiscalisationMovedTo(await searchParams));
}
