import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPortalSession();
  return children;
}
