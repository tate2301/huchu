import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DocumentsListContent } from "@/components/crm/documents/documents-list-content";
import { authOptions } from "@/lib/auth";

export default async function CrmInvoicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage
      title="Invoices"
      description="what has been billed, and what is still owed"
    >
      <DocumentsListContent
        kind="INVOICE"
        title="Invoices"
        searchPlaceholder="Search by invoice number, customer or deal"
        emptyBody="Invoices come from an accepted quote. Convert one on the deal it belongs to."
      />
    </CrmPage>
  );
}
