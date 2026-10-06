import { CustomReportScreen } from "@/components/reports/custom/custom-report-screen";

export default async function CustomReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomReportScreen id={id} />;
}
