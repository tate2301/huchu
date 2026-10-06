import { HeldScreen } from "@/components/retail/till/held";
import { requireTillDevice } from "../../device-page";

export default async function TillHeldPage() {
  await requireTillDevice();
  return <HeldScreen />;
}
