"use client";

import type { WorkspaceProduct } from "@prisma/client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@corelithzw/react";

import { StandingBadge } from "@/components/admin/standing-badge";
import { WorkspaceMark } from "@/components/admin/workspace-mark";
import type { StandingReading } from "@/lib/admin/standing";
import { Buildings, Globe, UserSwitch, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./admin-shell.module.css";
import { OPEN_SWITCHER_EVENT } from "./context-switcher";

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The strip across the top of every page that says which context this is.
 *
 * Neutral for all workspaces. Inside one it takes the selection tint and a
 * blue edge, and names the workspace, its address and its standing — so a
 * change made on any page below it is visibly a change to that workspace.
 */
export function ScopeBar({
  workspace,
}: {
  workspace: {
    slug: string;
    name: string;
    product: WorkspaceProduct;
    profile: string | null;
    standing: StandingReading;
  } | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!workspace) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      // A menu or a dialog takes Esc for itself first.
      if (document.querySelector('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return;
      if (event.key === "Escape") router.push("/admin/workspaces");
      if (event.key.toLowerCase() === "s" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        router.push(`/admin/w/${workspace.slug}/members`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, workspace]);

  if (!workspace) {
    return (
      <div role="region" aria-label="Context: all workspaces" className={styles.scope}>
        <Globe className={styles.itemIcon} />
        <span className={styles.scopeName}>All workspaces</span>
        <span className={cn(styles.scopeNote, styles.hideOnPhone)}>
          · Find anyone and work the queues. A change to one workspace happens inside it.
        </span>
        <div className={styles.scopeEnd}>
          <Button
            variant="ghost"
            size="sm"
            startIcon={<Buildings />}
            onClick={() => window.dispatchEvent(new Event(OPEN_SWITCHER_EVENT))}
          >
            Open a workspace <span className={cn(styles.kbd, styles.hideOnPhone)}>O</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label={`Context: ${workspace.name}`} className={cn(styles.scope, styles.scopeWorkspace)}>
      <WorkspaceMark product={workspace.product} profile={workspace.profile} size="sm" />
      <span className={styles.scopeName}>{workspace.name}</span>
      <span className={cn("font-mono text-xs text-[var(--ink-3)]", styles.hideOnPhone)}>{workspace.slug}</span>
      <StandingBadge reading={workspace.standing} withDetail />
      <span className={cn(styles.scopeNote, styles.hideOnPhone)}>· Every change here applies to {workspace.name} only</span>
      <div className={styles.scopeEnd}>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<UserSwitch />}
          aria-label={`Sign in as a member of ${workspace.name}`}
          onClick={() => router.push(`/admin/w/${workspace.slug}/members`)}
        >
          <span className={styles.hideOnPhone}>Sign in as</span>
          <span className={cn(styles.kbd, styles.hideOnPhone)}>S</span>
        </Button>
        <Button
          size="sm"
          startIcon={<X />}
          aria-label={`Leave ${workspace.name}`}
          onClick={() => router.push("/admin/workspaces")}
        >
          <span className={styles.hideOnPhone}>Leave workspace</span>
          <span className={cn(styles.kbd, styles.hideOnPhone)}>Esc</span>
        </Button>
      </div>
    </div>
  );
}
