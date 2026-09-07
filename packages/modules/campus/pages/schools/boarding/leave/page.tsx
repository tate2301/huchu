import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { BoardingLeaveContent } from "../../../../components/boarding/boarding-leave-content";

/**
 * Leave and outings.
 *
 * The canvas draws this as a card on the allocations board. It is also a
 * workflow with four moves in it, and a workflow that can only be worked from
 * inside somebody else's screen has no home — so it has a route of its own and
 * the board keeps its card.
 */
export default async function BoardingLeavePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BoardingLeaveContent />
    </div>
  );
}
