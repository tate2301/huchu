import { redirect } from "next/navigation";

/** One requisition, at its Books address (design/books/NOTES.md §2). */
export default async function CrmRequisitionMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/books/requisitions/${id}`);
}
