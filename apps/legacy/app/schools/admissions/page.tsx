import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { AdmissionsBoardContent } from "@/components/schools/admissions/admissions-board-content";
import { authOptions } from "@/lib/auth";

/**
 * The admissions office.
 *
 * The pipeline leads, because a school in September is asking where its
 * applicants are, not how many children it enrolled last term. The enrolment
 * list that used to be this page is still here, one rail item along.
 */
export default async function SchoolsAdmissionsPage() {
  const session = await getServerSession(authOptions);
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
