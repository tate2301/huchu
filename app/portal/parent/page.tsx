import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { ParentPortalContent } from "@/components/schools/portal/parent-portal-content";
import { authOptions } from "@/lib/auth";

export default async function ParentPortalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Parent Portal"
        description="Linked children, published results, and boarding visibility."
      />
      <ParentPortalContent />
    </div>
  );
}
