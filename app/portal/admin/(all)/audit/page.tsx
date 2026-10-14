import { AuditView } from "@/components/admin/audit/audit-view";

export const metadata = { title: "Audit log · Corelith admin" };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string }> }) {
  const { tab, before } = await searchParams;
  return (
    <AuditView
      basePath="/admin/audit"
      tab={tab}
      before={before}
      description="Everything recorded in every workspace and in this portal, newest first. Each row is chained to the one before it in its workspace."
    />
  );
}
