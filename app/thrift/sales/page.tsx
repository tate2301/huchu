import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { ThriftDashboardContent } from "@/components/thrift/thrift-dashboard-content";
import { authOptions } from "@/lib/auth";

export default async function ThriftSalesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Shop Sales" description="View and record sales transactions." />
      <ThriftDashboardContent />
    </div>
  );
}
