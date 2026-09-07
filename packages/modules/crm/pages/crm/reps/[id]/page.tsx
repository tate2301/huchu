import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { RepDetailPage } from "../../../../components/reps/rep-detail-page";

export default async function CrmRepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <RepDetailPage repId={id} />
    </CrmPage>
  );
}
