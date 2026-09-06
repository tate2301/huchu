import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SchoolsImportContent } from "@corelithzw/module-campus/components/imports/schools-import-content";
import { authOptions } from "@/lib/auth";

/**
 * S-3.3 — bringing a school's records over from whatever it used before.
 *
 * Office work, so it lives on the admin dashboard rather than in either portal:
 * a registrar loads the roll and a bursar loads what families already owe, and
 * neither job belongs to a teacher.
 */
export default async function SchoolsImportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Import records"
        description="Bring students, parents, classes, fee structures and outstanding balances over from your old system."
      />
      <SchoolsImportContent />
    </div>
  );
}
