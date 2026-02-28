import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsAcademicsContent } from "@/components/schools/academics/schools-academics-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsAcademicsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Academics Setup"
        description="Classes, streams, and subject master data."
      />
      <SchoolsAcademicsContent />
    </div>
  );
}

