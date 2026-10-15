import { redirect } from "next/navigation";

/** An allocation moved to Gold → Allocations. */
export default async function OldAllocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/gold/allocations/${encodeURIComponent(id)}`);
}
