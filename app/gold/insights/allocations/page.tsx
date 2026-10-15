import { redirect } from "next/navigation";

/** Allocations moved to Gold → Allocations. */
export default function OldAllocationsPage() {
  redirect("/gold/allocations");
}
