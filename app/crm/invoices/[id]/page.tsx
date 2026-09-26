import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DocumentRecordContent } from "@/components/crm/documents/document-record-content";
import { authOptions } from "@/lib/auth";

/** One invoice. Collections, the list and the deal link here. */
export default async function CrmInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <DocumentRecordContent documentId={id} kind="INVOICE" />
    </CrmPage>
  );
}
