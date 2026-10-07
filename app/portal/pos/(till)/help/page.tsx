import { HelpScreen } from "@/components/retail/till/person";
import { requireTillDevice } from "../../device-page";

export default async function TillHelpPage() {
  await requireTillDevice();
  return <HelpScreen />;
}
