import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolDocumentsContent } from "@/components/schools/documents/school-documents-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolDocumentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="School Documents"
        description="Generate and print school reports, invoices, and other documents."
      />
      <SchoolDocumentsContent />
    </div>
  );
}
