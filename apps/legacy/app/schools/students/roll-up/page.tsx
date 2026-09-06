import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { YearRollUpContent } from "@corelithzw/module-campus/components/students/year-rollup-content";
import { authOptions } from "@/lib/auth";

/**
 * The end of the year, as one reviewable operation.
 *
 * Deliberately its own page rather than a button on the students list: it is
 * the only action in the module that touches every child's record, and it does
 * not belong next to "add a student".
 *
 * The heading is inside the content component, because the primary action —
 * "Roll 772 students up" — carries a live count of the plan, which only that
 * component knows.
 */
export default async function YearRollUpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <YearRollUpContent />
    </div>
  );
}
