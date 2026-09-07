import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { DocumentsListContent } from "../../../components/documents/documents-list-content";

export default async function CrmInvoicesPage() {
  const session = await getCurrentAuthSession();
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
