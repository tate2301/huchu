import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { CompanyDetailPage } from "@/components/crm/records/company-detail-page";
import { authOptions } from "@/lib/auth";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <CompanyDetailPage companyId={id} />
    </CrmPage>
  );
}
