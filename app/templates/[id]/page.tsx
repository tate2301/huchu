import { redirect } from "next/navigation";

/** A template opens in Build's builder now, keeping its id (spec/routes.md §5). */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/build/documents/${encodeURIComponent(id)}`);
}
