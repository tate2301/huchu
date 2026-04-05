import { AdminRouteLoading } from "@/components/admin-portal/admin-route-loading";

export default function Loading() {
  return (
    <AdminRouteLoading
      label="Loading workspace module"
      description="Opening the selected admin module for this workspace."
    />
  );
}
