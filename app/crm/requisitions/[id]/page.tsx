import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { RequisitionDetailContent } from "@/components/crm/money/requisition-detail-content";
import { authOptions } from "@/lib/auth";

/**
 * One requisition. The approval and payment notifications link here.
 */
export default async function CrmRequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <RequisitionDetailContent requisitionId={id} />
    </CrmPage>
  );
}
