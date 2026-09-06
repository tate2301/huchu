import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { DealDetailPage } from "@/components/crm/records/deal-detail-page";
import { authOptions } from "@/lib/auth";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <DealDetailPage dealId={id} />
    </CrmPage>
  );
}
