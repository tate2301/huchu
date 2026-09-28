import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DailyReportRecordContent } from "@/components/crm/money/daily-report-record-content";
import { authOptions } from "@/lib/auth";

/** One person's day, as they closed it. The close-the-day notification links here. */
export default async function CrmDailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <DailyReportRecordContent reportId={id} />
    </CrmPage>
  );
}
