import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { HomeworkOversightContent } from "@corelithzw/module-campus/components/homework/homework-oversight-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsHomeworkPage() {
  const session = await getServerSession(authOptions);
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
