import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { TasksRegisterContent } from "@corelithzw/module-crm/components/tasks/tasks-register-content";
import { authOptions } from "@/lib/auth";

/**
 * The task register — everything outstanding, whoever owns it.
 *
 * This route used to redirect to Follow-ups on the grounds that they were two
 * doors onto one queue. They are two questions: Follow-ups is "what do I owe a
 * customer today", this is "what is outstanding across the team and who has
 * it". Both read the same rows and neither is a second to-do system.
 */
export default async function CrmTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage
      title="Tasks"
      description="what the team owes, and when it is due"
    >
      <TasksRegisterContent />
    </CrmPage>
  );
}
