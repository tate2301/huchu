import { redirect } from "next/navigation";

/** An intake form opens in Build's form builder, keeping its id (spec/routes.md §5). */
export default async function CrmFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/build/forms/${encodeURIComponent(id)}`);
}
