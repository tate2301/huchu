import { CustomerScreen } from "@/components/retail/till/display";
import { requireTillDevice } from "../device-page";

/**
 * The customer screen, opened from the till's menu into a second window on a
 * screen that faces the customer. Outside the till's shell: it shows the sale,
 * never the till.
 */
export default async function CustomerScreenPage() {
  const device = await requireTillDevice();
  return <CustomerScreen tillId={device.register.id} />;
}
