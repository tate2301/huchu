import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsClassesContent } from "@/components/schools/classes/schools-classes-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsClassesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Classes" description="Manage classes and streams." />
      <SchoolsClassesContent />
    </div>
  );
}
