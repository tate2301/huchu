import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ManagementShell } from "@/components/settings/management-shell";
import { SubjectRecordPage } from "@/components/schools/records/subject-record-page";
import { authOptions } from "@/lib/auth";

/** One subject, as a record, inside the management shell its list lives in. */
export default async function SubjectRecordMasterDataRoute({
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
    <ManagementShell area="master-data" title="Subjects">
      <SubjectRecordPage subjectId={id} />
    </ManagementShell>
  );
}
