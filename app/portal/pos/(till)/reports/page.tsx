import { ReportsScreen } from "@/components/retail/till/reports";
import { requireTillDevice } from "../../device-page";

export default async function TillReportsPage() {
  await requireTillDevice();
  return <ReportsScreen />;
}
