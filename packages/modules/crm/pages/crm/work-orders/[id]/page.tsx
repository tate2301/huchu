import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { JobDetailPage } from "../../../../components/work-orders/job-detail-page";

export default async function CrmWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <JobDetailPage jobId={id} />
    </CrmPage>
  );
}
