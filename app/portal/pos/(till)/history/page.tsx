import { HistoryScreen } from "@/components/retail/till/history";
import { requireTillDevice } from "../../device-page";

export default async function TillHistoryPage() {
  await requireTillDevice();
  return <HistoryScreen />;
}
