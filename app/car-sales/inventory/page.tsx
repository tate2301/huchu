import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CarSalesInventoryContent } from "@/components/car-sales/inventory/car-sales-inventory-content";
import { authOptions } from "@/lib/auth";

export default async function CarSalesInventoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Auto Inventory"
        description="Vehicle stock, listing value, and approval floor tracking."
      />
      <CarSalesInventoryContent />
    </div>
  );
}
