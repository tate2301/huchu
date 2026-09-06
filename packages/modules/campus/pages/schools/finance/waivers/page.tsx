import { redirect } from "next/navigation";

/** Kept as a redirect because links to it exist in the wild. */
export default function SchoolsFinanceWaiversPage() {
  redirect("/schools/finance/ledger?view=waivers");
}
