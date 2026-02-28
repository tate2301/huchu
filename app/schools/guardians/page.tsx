import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { GuardiansContent } from "@/components/schools/guardians/guardians-content";
import { authOptions } from "@/lib/auth";

export default async function GuardiansPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Guardians"
        description="Parent and guardian records linked to students."
      />
      <GuardiansContent />
    </div>
  );
}
