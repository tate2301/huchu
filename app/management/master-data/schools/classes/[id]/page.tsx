import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ManagementShell } from "@/components/settings/management-shell";
import { ClassRecordPage } from "@/components/schools/records/class-record-page";
import { authOptions } from "@/lib/auth";

/**
 * One class, as a record.
 *
 * Inside the management shell rather than the school's, because the list it is
 * reached from lives here. The band keeps naming the section it was opened
 * from, and the record page below draws the class itself.
 */
export default async function ClassRecordMasterDataRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <ManagementShell area="master-data" title="Classes and streams">
      <ClassRecordPage classId={id} />
    </ManagementShell>
  );
}
