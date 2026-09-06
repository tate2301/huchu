import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { HostelRecordPage } from "../../../../components/records/hostel-record-page";

/** S-4.3 — a hostel is a record page. See the student route for why no heading. */
export default async function HostelRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <HostelRecordPage hostelId={id} />;
}
