import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { verticalOf } from "@/lib/reports/verticals";

import { ProductionDashboard } from "./production-dashboard";

/**
 * A gold mine's production dashboard is Reports → Insights → Production
 * (PageMineProduction) now; every other workspace keeps this page as it is.
 */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (verticalOf(session?.user?.workspaceProfile) === "mine") redirect("/reports/insights/production");
  return <ProductionDashboard />;
}
