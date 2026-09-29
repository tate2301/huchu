import { ReportScreen } from "@/components/reports/report-screen";

export default async function ReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ReportScreen reportKey={key} />;
}
