import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { ListDetailPage } from "@/components/crm/records/list-detail-page";
import { authOptions } from "@/lib/auth";

export default async function CrmListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage>
      <ListDetailPage listId={id} />
    </CrmPage>
  );
}
