import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsFeesContent } from "@/components/schools/fees/schools-fees-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsFinancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="School Finance"
        description="Fee structures, invoicing, receipts, waivers, and collections."
      />
      <SchoolsFeesContent />
    </div>
  );
}

