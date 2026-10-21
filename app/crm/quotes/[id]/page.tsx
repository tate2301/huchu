import { redirect } from "next/navigation";

/** One quote, at its Books address (the CRM document's id; design/books/NOTES.md §2). */
export default async function CrmQuoteMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/books/quotes/${id}`);
}
