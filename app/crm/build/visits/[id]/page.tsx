import { redirect } from "next/navigation";

/**
 * A site-visit form's builder is Build's form builder now, keeping the id. The
 * visits run with the form stay here, at `/crm/build/visits/[id]/insights`,
 * linked from the form in Build (Insights).
 */
export default async function VisitFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/build/forms/${encodeURIComponent(id)}`);
}
