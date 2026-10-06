import { SellScreen } from "@/components/retail/till/sell";
import { requireTillDevice } from "../device-page";

export default async function TillSellPage() {
  await requireTillDevice();
  return <SellScreen />;
}
