import { SaleScreen } from "@/components/retail/till/history";
import { requireTillDevice } from "../../../device-page";

export default async function TillSalePage({ params }: { params: Promise<{ id: string }> }) {
  await requireTillDevice();
  const { id } = await params;
  return <SaleScreen id={id} />;
}
