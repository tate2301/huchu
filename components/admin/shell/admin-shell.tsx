import type { WorkspaceProduct } from "@prisma/client";
import type { ReactNode } from "react";

import { signOut } from "@/app/admin/login/actions";
import type { StandingReading } from "@/lib/admin/standing";
import type { SignedInOperator } from "@/lib/operators/guards";
import { OPERATOR_ROLE_LABEL } from "@/lib/operators/roles";

import { AdminSidebarNav, AdminTabBar } from "./admin-nav";
import styles from "./admin-shell.module.css";
import { ContextSwitcher } from "./context-switcher";
import { ScopeBar } from "./scope-bar";

export type ShellWorkspace = {
  slug: string;
  name: string;
  product: WorkspaceProduct;
  profile: string | null;
  standing: StandingReading;
};

/**
 * The portal's frame, in one of two contexts: all workspaces, or one.
 *
 * The context shows in four places at once — the switcher, the scope bar, the
 * sidebar's pages and the tab bar — and all four read the one `workspace`
 * prop, so they cannot disagree.
 */
export function AdminShell({
  operator,
  workspace,
  children,
}: {
  operator: SignedInOperator;
  workspace: ShellWorkspace | null;
  children: ReactNode;
}) {
  const context = workspace ? { kind: "workspace" as const, slug: workspace.slug, name: workspace.name } : { kind: "all" as const };
  const operatorLine = `${operator.name}, ${OPERATOR_ROLE_LABEL[operator.role].toLowerCase()}`;

  return (
    <div className={styles.app}>
      <aside className={styles.side} aria-label="Main">
        <ContextSwitcher current={workspace} operatorLine={operatorLine} />
        <AdminSidebarNav context={context} role={operator.role} />
        <div className={styles.foot}>
          <span className={styles.footWho}>{operator.name}</span>
          <div className={styles.footRow}>
            <span>{OPERATOR_ROLE_LABEL[operator.role]}</span>
            <form action={signOut}>
              <button type="submit" className="text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--ink)]">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <ScopeBar workspace={workspace} />
      <main className={styles.main}>{children}</main>
      <AdminTabBar context={context} role={operator.role} />
    </div>
  );
}
