import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { BoardingAllocationsContent } from "../../../../components/boarding/boarding-allocations-content";

/**
 * Boarding Management — the term's allocations.
 *
 * The heading lives inside the content component: the page's one primary action
 * is "Allocate a bed", which is gated on the signed-in person's grants and
 * disabled when the school has no hostel yet, and neither of those is a
 * question a server component can answer.
 */
export default async function BoardingAllocationsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BoardingAllocationsContent />
    </div>
  );
}
