import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { SubjectRecordPage } from "../../../../../../components/records/subject-record-page";

/** One subject, as a record, inside the Master Data shell its list moved to. */
export default async function SubjectRecordMasterDataRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
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
