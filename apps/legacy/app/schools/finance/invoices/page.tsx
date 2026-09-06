import { redirect } from "next/navigation";

/**
 * The invoice list is one view of the ledger, which S-4.6 moved out of
 * `/schools/finance` when that became the year-group picker. Kept as a redirect
 * because links to it exist in the wild.
 */
export default function SchoolsFinanceInvoicesPage() {
  redirect("/schools/finance/ledger?view=invoices");
}
