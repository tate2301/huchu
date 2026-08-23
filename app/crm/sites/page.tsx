import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { SitesContent } from "@/components/crm/records/sites-content";
import { authOptions } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmSitesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="Sites" description="where the work actually happens">
      <SitesContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
