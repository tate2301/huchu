import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { GuardianRecordPage } from "../../../../components/records/guardian-record-page";

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
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <GuardianRecordPage guardianId={id} />;
}
