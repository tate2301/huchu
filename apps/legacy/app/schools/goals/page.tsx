import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { GoalsOversightContent } from "@/components/schools/goals/goals-oversight-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsGoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Subject targets"
        description="What each pupil is aiming for this term, and which pupils nobody has set a target for."
      />
      <GoalsOversightContent />
    </div>
  );
}
