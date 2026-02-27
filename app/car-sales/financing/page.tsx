import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CarSalesFinancingContent } from "@/components/car-sales/financing/car-sales-financing-content";
import { authOptions } from "@/lib/auth";

export default async function CarSalesFinancingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Car Sales Financing"
        description="Deposit and settlement tracking across active dealership deals."
      />
      <CarSalesFinancingContent />
    </div>
  );
}
