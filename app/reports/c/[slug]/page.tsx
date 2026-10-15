import { CustomReportScreen } from "@/components/reports/custom/custom-report-screen";

/**
 * A custom report (ReportMonday). Its address carries the report's id: the
 * CustomReport table has no slug column yet.
 */
export default async function CustomReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CustomReportScreen id={slug} />;
}
