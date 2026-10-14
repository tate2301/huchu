import type { ReactNode } from "react";

/**
 * The page's own bar: its name and its actions, under the scope bar. One
 * primary action at most, on the right.
 */
export function AdminPageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3 py-2">
      <h1 className="t-page-title text-[var(--ink)]">{title}</h1>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * The page body, inside its gutter. The record table, the tabs and the
 * toolbar bleed back through it so their rules run edge to edge. Sticky rows
 * pin under the scope bar, which is one large control tall.
 */
export function AdminPage({ children }: { children: ReactNode }) {
  return (
    <div className="px-[var(--content-gutter-x)] [--content-gutter-x:var(--space-4)] [--stack-top:var(--h-control-lg)] md:[--content-gutter-x:var(--gutter-x)]">
      {children}
    </div>
  );
}
