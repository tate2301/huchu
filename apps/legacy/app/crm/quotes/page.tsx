import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DocumentsListContent } from "@/components/crm/documents/documents-list-content";
import { authOptions } from "@/lib/auth";

export default async function CrmQuotesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage
      title="Quotes"
      description="what is out with customers"
    >
      <DocumentsListContent
        kind="QUOTATION"
        title="Quotes"
        searchPlaceholder="Search by quote number, customer or deal"
        emptyBody="Quotes are raised from a deal — open one and use “New quotation”."
      />
    </CrmPage>
  );
}
