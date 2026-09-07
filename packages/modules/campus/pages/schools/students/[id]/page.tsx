import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { StudentRecordPage } from "../../../../components/records/student-record-page";

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
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <StudentRecordPage studentId={id} />;
}
