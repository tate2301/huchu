import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { RepDetailPage } from "@corelithzw/module-crm/components/reps/rep-detail-page";
import { authOptions } from "@/lib/auth";

export default async function CrmRepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <RepDetailPage repId={id} />
    </CrmPage>
  );
}
