import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ReportBuilder } from "@/components/reports/custom/report-builder";
import { authOptions } from "@/lib/auth";
import { buildHref } from "@/lib/build/items";
import { findBuildRecord } from "@/lib/build/read";

/**
 * A report in Build (BuildReport): the custom report's own builder — the
 * same component as `/reports/c/[slug]/edit`, not a copy — reached from Build
 * and going back to Build's Reports (`/build?kind=reports`). Who may change it is the API's to say; the builder
 * shows its answer.
 */
export default async function BuildReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { slug } = await params;
  const user = session.user as { companyId: string };
  const record = await findBuildRecord(user.companyId, slug);
  if (!record) notFound();
  if (record.source !== "report") redirect(record.source === "catalog" || record.source === "layout" ? `/build/templates/${encodeURIComponent(slug)}` : buildHref(record.source, slug, "kind" in record ? record.kind : undefined));
  return <ReportBuilder id={slug} back={{ href: "/build?kind=reports", label: "Build", button: "Back to Build" }} arrangement="build" />;
}
