import { redirect } from "next/navigation";
import { goldRoutes } from "../../../routes";

export default function GoldReconciliationLegacyPage() {
  redirect(`${goldRoutes.exceptions.home}?view=missing-sale`);
}
