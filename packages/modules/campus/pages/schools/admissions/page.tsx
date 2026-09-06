import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { AdmissionsBoardContent } from "../../../components/admissions/admissions-board-content";

/**
 * The admissions office.
 *
 * The pipeline leads, because a school in September is asking where its
 * applicants are, not how many children it enrolled last term. The enrolment
 * list that used to be this page is still here, one rail item along.
 */
export default async function SchoolsAdmissionsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Admissions" />
      <AdmissionsBoardContent />
    </div>
  );
}
