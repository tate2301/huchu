import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { AdminShell } from "@/components/admin-portal/shell/admin-shell";

type AdminRouteLoadingProps = {
  label: string;
  description: string;
};

export function AdminRouteLoading({
  label,
  description,
}: AdminRouteLoadingProps) {
  return (
    <AdminShell>
      <AdminModuleLoading label={label} />
    </AdminShell>
  );
}
