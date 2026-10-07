import { CustomReportScreen } from "@/components/reports/custom/custom-report-screen";

/** A built-in custom report, read on the reader's own rows. Whether it is offered to them is the API's to say. */
export default async function BuiltInReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <CustomReportScreen id={`built-${key}`} builtIn={key} />;
}
