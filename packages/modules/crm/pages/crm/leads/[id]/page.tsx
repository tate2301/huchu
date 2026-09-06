import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../../components/crm-page";
import { redirect } from "next/navigation";
import { LeadDetailPage } from "../../../../components/lead-detail/lead-detail-page";

export default async function CrmLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <LeadDetailPage leadId={id} />
    </CrmPage>
  );
}
