import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SchoolsTimetableContent } from "../../../components/timetable/schools-timetable-content";

export default async function SchoolsTimetablePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Timetable"
        description="The week as a grid of days against periods — read it by class or by teacher, and place, move or remove a lesson where you see the gap."
      />
      <SchoolsTimetableContent />
    </div>
  );
}
