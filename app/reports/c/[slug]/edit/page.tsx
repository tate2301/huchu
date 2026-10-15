import { ReportBuilder } from "@/components/reports/custom/report-builder";

/** Building a custom report (ReportBuild). Who may change it is the API's to say; the builder shows its answer. */
export default async function BuildCustomReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ReportBuilder id={slug} />;
}
