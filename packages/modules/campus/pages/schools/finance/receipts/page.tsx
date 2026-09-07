import { redirect } from "next/navigation";

/**
 * `lib/navigation.ts` points Receipts at the ledger's own segment. This route
 * predates that and used to send anybody who followed an old link to the
 * year-group picker — a different screen with none of the receipts on it.
 */
export default function SchoolsFinanceReceiptsPage() {
  redirect("/schools/finance/ledger?view=receipts");
}
