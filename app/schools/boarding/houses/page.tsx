import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BoardingHousesContent } from "@/components/schools/boarding/boarding-houses-content";
import { authOptions } from "@/lib/auth";

/**
 * The houses.
 *
 * The boarding rebuild made this the landing page — "you go to a house first" —
 * built `BoardingHousesContent` and `houses/[id]` for it, and pointed the house
 * record's back link here. The route file itself was never written, so the list
 * was a 404, its component was orphaned, and every back link out of a house
 * record landed on nothing.
 *
 * Thin like its siblings: which houses a warden may see, what the row count
 * says and which verbs are offered all turn on the signed-in person's grants,
 * and none of that is a question a server component can answer.
 */
export default async function BoardingHousesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BoardingHousesContent />
    </div>
  );
}
