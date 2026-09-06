import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { ClassRecordPage } from "@/components/schools/records/class-record-page";
import { authOptions } from "@/lib/auth";

/**
 * One class, as a record.
 *
 * Inside the Master Data shell rather than the school's, because the list it
 * is reached from moved there. The record page draws its own heading, so the
 * shell's is the section name.
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
    <MasterDataShell activeTab="schools-classes" title="Classes and Streams">
      <ClassRecordPage classId={id} />
    </MasterDataShell>
  );
}
