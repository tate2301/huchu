import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CarSalesDealsContent } from "@/components/car-sales/deals/car-sales-deals-content";
import { authOptions } from "@/lib/auth";

export default async function CarSalesDealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Car Sales Deals"
        description="Quoted, reserved, and contracted deals through delivery readiness."
      />
      <CarSalesDealsContent />
    </div>
  );
}
