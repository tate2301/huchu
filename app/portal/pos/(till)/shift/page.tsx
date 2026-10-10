import { ShiftScreen } from "@/components/retail/till/shift";
import { requireTillDevice } from "../../device-page";

export default async function TillShiftPage() {
  await requireTillDevice();
  return <ShiftScreen />;
}
