import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { CompaniesContent } from "../../../components/records/companies-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmCompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="Companies" description="the businesses you sell to">
      <CompaniesContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
