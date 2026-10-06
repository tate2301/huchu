import { ActivityScreen } from "@/components/retail/till/person";
import { requireTillDevice } from "../../device-page";

export default async function TillActivityPage() {
  await requireTillDevice();
  return <ActivityScreen />;
}
