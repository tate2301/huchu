import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { DocumentsListContent } from "../../../components/documents/documents-list-content";

export default async function CrmQuotesPage() {
  const session = await getCurrentAuthSession();
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
