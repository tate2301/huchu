import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DocumentsListContent } from "@/components/crm/documents/documents-list-content";
import { authOptions } from "@/lib/auth";

export default async function CrmReceiptsPage() {
  const session = await getServerSession(authOptions);
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
