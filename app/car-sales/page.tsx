import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CarSalesContent } from "@/components/car-sales/car-sales-content";
import { authOptions } from "@/lib/auth";

export default async function CarSalesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Car Sales"
        description="Lead pipeline, vehicle inventory, deals, and payment readiness."
      />
      <CarSalesContent />
    </div>
  );
}
