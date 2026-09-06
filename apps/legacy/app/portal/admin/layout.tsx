import "../../themes/admin.css";
import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPortalSession();
  return <div data-portal="admin">{children}</div>;
}
