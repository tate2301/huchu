import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { BoardingLeaveContent } from "@/components/schools/boarding/boarding-leave-content";
import { authOptions } from "@/lib/auth";

/**
 * Leave and outings.
 *
 * The canvas draws this as a card on the allocations board. It is also a
 * workflow with four moves in it, and a workflow that can only be worked from
 * inside somebody else's screen has no home — so it has a route of its own and
 * the board keeps its card.
 */
export default async function BoardingLeavePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BoardingLeaveContent />
    </div>
  );
}
