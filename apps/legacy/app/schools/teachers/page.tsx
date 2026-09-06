import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SchoolsTeachersContent } from "@/components/schools/teachers/schools-teachers-content";
import { authOptions } from "@/lib/auth";

/**
 * The heading moved inside `SchoolsTeachersContent`.
 *
 * Its caption counts the staff list and its primary action opens a form, both
 * of which are client state. See the guardians route for the same reasoning.
 */
export default async function SchoolsTeachersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <SchoolsTeachersContent />
    </div>
  );
}
