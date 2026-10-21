import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LeavingDocumentsContent } from "@/components/schools/leavers/leaving-documents-content";
import { authOptions } from "@/lib/auth";

/**
 * Leaving documents — S-13.5.
 *
 * Four of the five documents need a source key, an access entry, a resolver and
 * a default template in the shared document pipeline before they can be raised.
 * The screen says which, and why, rather than drawing buttons that cannot be
 * honoured.
 */
export default async function SchoolsLeavingDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ leaver?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { leaver } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <LeavingDocumentsContent leaverId={leaver} />
    </div>
  );
}
