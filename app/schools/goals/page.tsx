import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { GoalsOversightContent } from "@/components/schools/goals/goals-oversight-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsGoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <GoalsOversightContent />
    </div>
  );
}
