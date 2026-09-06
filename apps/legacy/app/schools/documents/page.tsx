import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SchoolDocumentsContent } from "@corelithzw/module-campus/components/documents/school-documents-content";
import { authOptions } from "@/lib/auth";

/**
 * The paperwork a school office prints.
 *
 * The heading lives in the client component: the state band under it reports
 * the year group and the size of the roll in view, and both change with the
 * filters this file cannot see.
 */
export default async function SchoolDocumentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolDocumentsContent />
    </div>
  );
}
