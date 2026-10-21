import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { GuardiansContent } from "@/components/schools/guardians/guardians-content";
import { authOptions } from "@/lib/auth";

/**
 * The heading moved inside `GuardiansContent`.
 *
 * Its caption counts the guardians on file and how many are still not on the
 * portal, and its primary action opens a form — both of which are client
 * state. A server component cannot carry either, and a heading rendered here
 * with the numbers rendered below it is how a page ends up saying two
 * different things about the same list.
 */
export default async function GuardiansPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <GuardiansContent />
    </div>
  );
}
