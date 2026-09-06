import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { StudentRecordPage } from "@/components/schools/records/student-record-page";
import { authOptions } from "@/lib/auth";

/**
 * S-4.3 — a student is a record page.
 *
 * No `PageHeading` and no `max-w-7xl` wrapper any more: `RecordPageShell` puts
 * the pupil's name and the actions in the top app bar through `PageChrome`, the
 * same as every other record in the product, so a heading here would print the
 * name twice and a narrower column would fight the shell's own layout.
 */
export default async function StudentRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <StudentRecordPage studentId={id} />;
}
