import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { VisitFormInsights } from "@/components/crm/build/visit-form-insights";
import { authOptions } from "@/lib/auth";

export default async function VisitFormInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage>
      <VisitFormInsights id={id} />
    </CrmPage>
  );
}
