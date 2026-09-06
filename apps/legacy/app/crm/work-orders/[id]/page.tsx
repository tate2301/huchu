import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { JobDetailPage } from "@corelithzw/module-crm/components/work-orders/job-detail-page";
import { authOptions } from "@/lib/auth";

export default async function CrmWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <JobDetailPage jobId={id} />
    </CrmPage>
  );
}
