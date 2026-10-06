import { SettingsScreen } from "@/components/retail/till/person";
import { requireTillDevice } from "../../device-page";

export default async function TillSettingsPage() {
  await requireTillDevice();
  return <SettingsScreen />;
}
