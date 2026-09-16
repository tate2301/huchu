import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { HomeworkOversightContent } from "@/components/schools/homework/homework-oversight-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsHomeworkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <HomeworkOversightContent />
    </div>
  );
}
