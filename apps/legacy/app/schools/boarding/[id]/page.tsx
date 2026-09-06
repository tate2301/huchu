import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { HostelRecordPage } from "@/components/schools/records/hostel-record-page";
import { authOptions } from "@/lib/auth";

/** S-4.3 — a hostel is a record page. See the student route for why no heading. */
export default async function HostelRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <HostelRecordPage hostelId={id} />;
}
