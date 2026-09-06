import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";

import { CompaniesContent } from "@corelithzw/module-crm/components/records/companies-content";
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
