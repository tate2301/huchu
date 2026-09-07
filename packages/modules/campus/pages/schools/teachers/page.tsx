import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { SchoolsTeachersContent } from "../../../components/teachers/schools-teachers-content";

/**
 * The heading moved inside `SchoolsTeachersContent`.
 *
 * Its caption counts the staff list and its primary action opens a form, both
 * of which are client state. See the guardians route for the same reasoning.
 */
export default async function SchoolsTeachersPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <SchoolsTeachersContent />
    </div>
  );
}
