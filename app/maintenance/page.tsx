import { redirect } from "next/navigation";
import {
  MaintenanceContent,
  type MaintenanceView,
} from "@/components/maintenance/maintenance-content";

const maintenanceRoutes: Record<MaintenanceView, string> = {
  dashboard: "/maintenance",
  equipment: "/maintenance/equipment",
  "work-orders": "/maintenance/work-orders",
  breakdown: "/maintenance/breakdown",
  schedule: "/maintenance/schedule",
};

export default function MaintenanceDashboardPage({
  searchParams,
}: {
  searchParams?: { view?: string };
}) {
  const viewParam = searchParams?.view as MaintenanceView | undefined;
  if (viewParam && maintenanceRoutes[viewParam]) {
    redirect(maintenanceRoutes[viewParam]);
  }
  return <MaintenanceContent activeView="dashboard" />;
}
