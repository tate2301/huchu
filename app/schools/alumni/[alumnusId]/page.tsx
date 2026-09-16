import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AlumnusRecordPage } from "@/components/schools/leavers/alumnus-record-page";
import { authOptions } from "@/lib/auth";

/** One former pupil — S-13.5. */
export default async function SchoolsAlumnusPage({
  params,
}: {
  params: Promise<{ alumnusId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { alumnusId } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AlumnusRecordPage alumnusId={alumnusId} />
    </div>
  );
}
