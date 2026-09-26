import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { VisitRecordContent } from "@/components/crm/visits/visit-record-content";
import { authOptions } from "@/lib/auth";

/** One site visit. The visits list, daily reports and follow-ups link here. */
export default async function CrmSiteVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <VisitRecordContent visitId={id} />
    </CrmPage>
  );
}
