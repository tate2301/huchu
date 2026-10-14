import { VanePlansPage } from "@/components/vane/vane-plans-page";

export default async function VanePlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VanePlansPage planId={id} />;
}
