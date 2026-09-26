import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { CostEntryRecordContent } from "@/components/crm/money/cost-entry-record-content";
import { authOptions } from "@/lib/auth";

/** One line of money. The cost tracker's register and every money list link here. */
export default async function CrmCostEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <CostEntryRecordContent entryId={id} />
    </CrmPage>
  );
}
