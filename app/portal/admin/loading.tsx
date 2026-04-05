import { AdminRouteLoading } from "@/components/admin-portal/admin-route-loading";

export default function Loading() {
  return (
    <AdminRouteLoading
      label="Loading admin page"
      description="Opening the next admin view with the latest summaries, tables, and controls."
    />
  );
}
