import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { ListDetailPage } from "../../../../components/records/list-detail-page";

export default async function CrmListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage>
      <ListDetailPage listId={id} />
    </CrmPage>
  );
}
