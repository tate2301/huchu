import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { RequisitionsContent } from "@/components/crm/money/requisitions-content";
import { authOptions } from "@/lib/auth";

/**
 * Asking for money, and answering.
 *
 * Approval and payment are separate acts on this page because they are
 * separate acts in the business: somebody says yes, and on another day
 * somebody hands the cash over.
 */
export default async function CrmRequisitionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Requisitions">
      <RequisitionsContent />
    </CrmPage>
  );
}
