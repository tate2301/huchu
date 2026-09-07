import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../../components/crm-page";
import { redirect } from "next/navigation";

import { CompanyDetailPage } from "../../../../components/records/company-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <CompanyDetailPage companyId={id} />
    </CrmPage>
  );
}
