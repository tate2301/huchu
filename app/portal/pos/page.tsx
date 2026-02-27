import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { PosPortalContent } from "@/components/thrift/portal/pos-portal-content";
import { authOptions } from "@/lib/auth";

export default async function PosPortalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/portal/pos/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Point of Sale"
        description="Process sales, view catalog, and manage transactions."
      />
      <PosPortalContent />
    </div>
  );
}
