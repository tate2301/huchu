import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsFeesContent } from "@/components/schools/fees/schools-fees-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsFeesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="School Fees"
        description="Billing, collections, waivers, and arrears visibility."
      />
      <SchoolsFeesContent />
    </div>
  );
}
