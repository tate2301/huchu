import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { GuardiansContent } from "../../../components/guardians/guardians-content";

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
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <GuardiansContent />
    </div>
  );
}
