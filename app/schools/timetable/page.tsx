import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageChrome } from "@/components/layout/page-chrome";
import { SchoolsTimetableContent } from "@/components/schools/timetable/schools-timetable-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsTimetablePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageChrome
        title="Timetable"
      />
      <SchoolsTimetableContent />
    </div>
  );
}
