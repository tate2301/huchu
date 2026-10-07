import { CustomReportEditor } from "@/components/reports/custom/custom-report-editor";

/** Who may change the report is the API's to say; the editor shows its answer. */
export default async function EditCustomReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomReportEditor id={id} />;
}
