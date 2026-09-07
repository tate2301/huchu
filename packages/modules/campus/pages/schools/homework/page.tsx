import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { HomeworkOversightContent } from "../../../components/homework/homework-oversight-content";

export default async function SchoolsHomeworkPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Homework"
        description="Every class's homework in one place — what is set, what is due, and how much of it came back."
      />
      <HomeworkOversightContent />
    </div>
  );
}
