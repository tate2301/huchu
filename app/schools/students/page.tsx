import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { StudentsListContent } from "@/components/schools/students/students-list-content";
import { authOptions } from "@/lib/auth";

/**
 * The roll.
 *
 * This was a `GradePicker` and nothing else — the year group was the only way
 * in, and a school looking for one child by name had no screen to look on.
 * The year group is still a route of its own (`/class/[classId]`, reached from
 * every other campus screen that starts "which class?"); this page is the
 * register, filtered.
 *
 * The heading and the create verb are inside the client component: the one
 * primary action here opens a dialog, and a heading in this file could not
 * reach the state that dialog runs on.
 */
export default async function SchoolsStudentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <StudentsListContent />
    </div>
  );
}
