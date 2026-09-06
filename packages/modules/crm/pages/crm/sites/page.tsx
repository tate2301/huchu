import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { SitesContent } from "../../../components/records/sites-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmSitesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="Sites" description="where the work actually happens">
      <SitesContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
