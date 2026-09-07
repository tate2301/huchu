import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { PeopleContent } from "../../../components/records/people-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmPeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  return (
    <CrmPage title="People" description="everyone you deal with, and who they work for">
      <PeopleContent openCreate={params.new === "1"} />
    </CrmPage>
  );
}
