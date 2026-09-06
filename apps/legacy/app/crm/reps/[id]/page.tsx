import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { RepDetailPage } from "@/components/crm/reps/rep-detail-page";
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
