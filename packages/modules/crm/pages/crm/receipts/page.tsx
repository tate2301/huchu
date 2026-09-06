import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { DocumentsListContent } from "../../../components/documents/documents-list-content";

export default async function CrmReceiptsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <CrmPage>
      <DocumentsListContent
        kind="RECEIPT"
        title="Receipts"
        searchPlaceholder="Search by receipt number or customer"
        emptyBody="A receipt is written when a payment is recorded against an invoice."
      />
    </CrmPage>
  );
}
