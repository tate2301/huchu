import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { GuardianProfileContent } from "@/components/schools/guardians/guardian-profile-content";
import { authOptions } from "@/lib/auth";

export default async function GuardianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Guardian Profile" description="View guardian and linked students." />
      <GuardianProfileContent guardianId={id} />
    </div>
  );
}
