import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SickBayContent } from "@/components/schools/boarding/sick-bay-content";
import { authOptions } from "@/lib/auth";

/**
 * Who is ill, since when, and whose bed is being held.
 *
 * Its own page rather than a table under the bed board: a boarder in the sick
 * bay keeps their own bed, so this is a different subject from who has which
 * bed and belongs behind its own tab (§1 of the canvas law).
 *
 * The heading lives inside the content component: the page's primary action is
 * "Admit a pupil", which is gated on the signed-in person's grants.
 */
export default async function SickBayPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SickBayContent />
    </div>
  );
}
