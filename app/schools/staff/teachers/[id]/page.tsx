import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { TeacherRecordPage } from "@/components/schools/records/teacher-record-page";
import { authOptions } from "@/lib/auth";

/** S-4.3 — a teacher is a record page. See the student route for why no heading. */
export default async function TeacherRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <TeacherRecordPage teacherId={id} />;
}
