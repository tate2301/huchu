import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { FollowUpRecordContent } from "@/components/crm/follow-ups/follow-up-record-content";
import { authOptions } from "@/lib/auth";

/** One lead reminder. The follow-ups page links here. */
export default async function CrmFollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <FollowUpRecordContent followUpId={id} />
    </CrmPage>
  );
}
