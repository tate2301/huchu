import { AdminShell } from "@/components/admin/shell/admin-shell";
import { requireOperator } from "@/lib/operators/guards";

/** The all-workspaces context. Nothing here changes one workspace. */
export default async function AllWorkspacesLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperator();
  return (
    <AdminShell operator={operator} workspace={null}>
      {children}
    </AdminShell>
  );
}
