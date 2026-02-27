import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CarSalesLeadsContent } from "@/components/car-sales/leads/car-sales-leads-content";
import { authOptions } from "@/lib/auth";

export default async function CarSalesLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Car Sales Leads"
        description="Lead capture, qualification, and assignment pipeline."
      />
      <CarSalesLeadsContent />
    </div>
  );
}
