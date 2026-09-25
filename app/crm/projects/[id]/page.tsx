import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { ProjectDetailContent } from "@/components/crm/money/project-detail-content";
import { authOptions } from "@/lib/auth";

export default async function CrmProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage>
      <ProjectDetailContent projectId={id} />
    </CrmPage>
  );
}
