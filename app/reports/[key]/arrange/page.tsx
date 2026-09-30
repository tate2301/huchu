import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReportArranger } from "@/components/reports/report-arranger";
import { authOptions } from "@/lib/auth";
import { isOrgAdminRole } from "@/lib/preferences/nav";

/** Managers arrange a report's page; everybody else is sent to the report itself. */
export default async function ArrangeReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!isOrgAdminRole((session.user as { role?: string }).role)) redirect(`/reports/${key}`);
  return <ReportArranger reportKey={key} />;
}
