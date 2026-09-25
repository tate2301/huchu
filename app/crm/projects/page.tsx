import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { ProjectsContent } from "@/components/crm/money/projects-content";
import { authOptions } from "@/lib/auth";

/**
 * Projects — what a job belongs to when the work runs past a day.
 */
export default async function CrmProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Projects" description="the work, and what it has cost">
      <ProjectsContent />
    </CrmPage>
  );
}
