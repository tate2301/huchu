import { redirect } from "next/navigation";

/** Kept as a redirect because links to it exist in the wild. */
export default function SchoolsFinanceRefundsPage() {
  redirect("/schools/finance/ledger?view=refunds");
}
