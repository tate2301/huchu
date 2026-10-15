import { redirect } from "next/navigation";

/** A custom report's builder moved to `/reports/c/[slug]/edit`; old links keep working. */
export default async function OldEditCustomReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/reports/c/${encodeURIComponent(id)}/edit`);
}
