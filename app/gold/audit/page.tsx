import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldAuditLegacyPage() {
  redirect(goldRoutes.exceptions.home);
}
