import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { CompaniesContent } from "@/components/crm/records/companies-content";
import { authOptions } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmCompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="Companies" description="the businesses you sell to">
      <CompaniesContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
