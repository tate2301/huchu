import { AuditTable } from "@/components/admin/audit/audit-table";
import { UrlTabs } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { AUDIT_TABS, auditPage } from "@/lib/admin/audit";

/** The audit log, for all workspaces or one. The same tabs and the same table either way. */
export async function AuditView({
  basePath,
  companyId,
  tab,
  before,
  description,
}: {
  basePath: string;
  companyId?: string;
  tab?: string;
  before?: string;
  description: string;
}) {
  const { rows, olderBefore } = await auditPage({ companyId, tab, before });
  const older = olderBefore ? `${basePath}?${new URLSearchParams({ ...(tab ? { tab } : {}), before: olderBefore })}` : null;
  return (
    <AdminPage>
      <AdminPageHeader title="Audit log" />
      <p className="-mt-2 mb-3 t-body-sm text-[var(--text-muted)]">{description}</p>
      <UrlTabs
        label="Audit log views"
        tabs={[{ value: null, label: "Everything" }, ...Object.entries(AUDIT_TABS).map(([value, definition]) => ({ value, label: definition.label }))]}
      />
      <AuditTable rows={rows} withWorkspace={!companyId} olderHref={older} />
    </AdminPage>
  );
}
