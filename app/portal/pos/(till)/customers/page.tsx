import { CustomersScreen } from "@/components/retail/till/lookups";
import { requireTillDevice } from "../../device-page";

export default async function TillCustomersPage() {
  await requireTillDevice();
  return <CustomersScreen />;
}
