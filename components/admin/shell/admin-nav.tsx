"use client";

import type { OperatorRole } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Globe } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./admin-shell.module.css";
import { adminNavItems, isCurrent, type AdminContext } from "./nav-items";

/** The sidebar's pages: this context's, and inside a workspace the way out. */
export function AdminSidebarNav({ context, role }: { context: AdminContext; role: OperatorRole }) {
  const pathname = usePathname();
  return (
    <nav aria-label={context.kind === "workspace" ? `${context.name}` : "All workspaces"}>
      <ul className={styles.navList}>
        {adminNavItems(context, role).map((item) => {
          const current = isCurrent(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(styles.item, current && styles.itemCurrent)}
              >
                <item.icon className={styles.itemIcon} />
                <span className={styles.itemLabel}>{item.label}</span>
              </Link>
            </li>
          );
        })}
        {context.kind === "workspace" ? (
          <li className={styles.leave}>
            <Link href="/admin/workspaces" className={styles.item}>
              <Globe className={styles.itemIcon} />
              <span className={styles.itemLabel}>All workspaces</span>
              <span className={styles.kbd}>Esc</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/** The same pages at the foot of a phone, where the sidebar is not. */
export function AdminTabBar({ context, role }: { context: AdminContext; role: OperatorRole }) {
  const pathname = usePathname();
  const items = adminNavItems(context, role).slice(0, 5);
  return (
    <nav aria-label="Pages" className={styles.tabbar}>
      {items.map((item) => {
        const current = isCurrent(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(styles.tab, current && styles.tabCurrent)}
          >
            <item.icon />
            <span>{item.short ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
