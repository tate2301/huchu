import { WaitingScreen } from "@/components/retail/till/waiting";
import { requireTillDevice } from "../../device-page";

export default async function TillWaitingPage() {
  await requireTillDevice();
  return <WaitingScreen />;
}
