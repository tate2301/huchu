import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { TeachingResourcesContent } from "@corelithzw/module-campus/components/timetable/resources-content";
import { authOptions } from "@/lib/auth";

/**
 * The staff-room shelf: worksheets, past papers and links, filed by subject.
 *
 * The shelf was built and nothing rendered it, so the only way a school could
 * see what its teachers had uploaded was a REST client. It hangs off subjects
 * rather than classes — a Form 2 worksheet is the same worksheet next
 * September — which is why it lives under Teaching and not under a year group.
 */
export default async function SchoolsTeachingResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Teaching resources" />
      <TeachingResourcesContent />
    </div>
  );
}
