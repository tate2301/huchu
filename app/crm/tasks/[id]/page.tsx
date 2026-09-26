import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { TaskRecordContent } from "@/components/crm/tasks/task-record-content";
import { authOptions } from "@/lib/auth";

/** One task. The task lists, follow-ups and daily reports link here. */
export default async function CrmTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <TaskRecordContent taskId={id} />
    </CrmPage>
  );
}
