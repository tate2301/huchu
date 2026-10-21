import { CustomersScreen } from "@/components/retail/till/person";
import { requireTillDevice } from "../../device-page";

export default async function TillCustomersPage() {
  await requireTillDevice();
  return <CustomersScreen />;
}
