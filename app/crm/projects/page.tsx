import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { ProjectsContent } from "@/components/crm/money/projects-content";
import { authOptions } from "@/lib/auth";

/**
 * Projects — what a won deal turns into, and what its jobs belong to.
 */
export default async function CrmProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage>
      <ProjectsContent />
    </CrmPage>
  );
}
