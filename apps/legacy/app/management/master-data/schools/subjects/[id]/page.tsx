import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { SubjectRecordPage } from "@/components/schools/records/subject-record-page";
import { authOptions } from "@/lib/auth";

/** One subject, as a record, inside the Master Data shell its list moved to. */
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
    <MasterDataShell activeTab="schools-subjects" title="Subjects">
      <SubjectRecordPage subjectId={id} />
    </MasterDataShell>
  );
}
