import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { TeacherRecordPage } from "../../../../components/records/teacher-record-page";

/** S-4.3 — a teacher is a record page. See the student route for why no heading. */
export default async function TeacherRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <TeacherRecordPage teacherId={id} />;
}
