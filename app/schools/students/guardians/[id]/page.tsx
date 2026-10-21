import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GuardianRecordPage } from "@/components/schools/records/guardian-record-page";
import { authOptions } from "@/lib/auth";

/**
 * S-4.3 — a guardian is a record page.
 *
 * As with the student route: no `PageHeading` and no width wrapper, because
 * `RecordPageShell` puts the name and the actions in the top app bar through
 * `PageChrome`.
 */
export default async function GuardianRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <GuardianRecordPage guardianId={id} />;
}
