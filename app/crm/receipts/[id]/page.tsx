import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DocumentRecordContent } from "@/components/crm/documents/document-record-content";
import { authOptions } from "@/lib/auth";

/** One receipt. The invoice it paid links here. */
export default async function CrmReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <DocumentRecordContent documentId={id} kind="RECEIPT" />
    </CrmPage>
  );
}
