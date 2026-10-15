import { redirect } from "next/navigation";

/** Templates are Build's (spec/routes.md §5); the id is kept. */
export default async function CrmTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/build/documents/${encodeURIComponent(id)}`);
}
