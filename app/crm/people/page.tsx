import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { PeopleContent } from "@/components/crm/records/people-content";
import { authOptions } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmPeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="People" description="everyone you deal with, and who they work for">
      <PeopleContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
