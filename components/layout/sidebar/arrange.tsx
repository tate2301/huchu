"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/workspace/button";
import type { ComposedGroup, ComposedNode } from "@/lib/nav/compose";
import { inOrder, type NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import { ChromeIcon, NavIcon } from "./parts";
import styles from "./sidebar.module.css";

/**
 * Arrange mode (SB-arrange.dc.html): every page the person may open, in their
 * groups. A page is dragged within its group, never under another; the eye
 * hides it into More and brings it back. Workspace order puts every group
 * back as the registry has it. Alt with an arrow moves the focused row.
 */
export function ArrangeSidebar({
  groups,
  prefs,
  onHide,
  onOrder,
  onReset,
  onDone,
}: {
  groups: ComposedGroup[];
  prefs: NavPrefs;
  onHide: (id: string) => void;
  onOrder: (groupId: string, ids: string[]) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const [drag, setDrag] = React.useState<{ group: string; id: string } | null>(null);
  const [preview, setPreview] = React.useState<{ group: string; ids: string[] } | null>(null);
  const byId = React.useMemo(() => new Map(groups.flatMap((group) => group.items).map((node) => [node.id, node] as const)), [groups]);
  const pinned = prefs.pinned.map((id) => byId.get(id)).filter((node): node is ComposedNode => Boolean(node));

  const ordered = (group: ComposedGroup): ComposedNode[] => {
    if (preview?.group === group.id) return preview.ids.map((id) => byId.get(id)!).filter(Boolean);
    return inOrder(group.items, prefs.order[group.id]).filter((node) => !prefs.pinned.includes(node.id));
  };

  const move = (group: ComposedGroup, id: string, to: number) => {
    const ids = ordered(group).map((node) => node.id).filter((entry) => entry !== id);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    return ids;
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <aside className={styles.sb} aria-label="Arrange the sidebar">
      <div className={styles.arrangeHead}>
        <ChromeIcon name="menu" className={styles.ic} />
        Arrange your sidebar
      </div>
      <div className={styles.scroll} style={{ paddingTop: 8 }}>
        <nav className={styles.tree} aria-label="Workspace">
          {groups.map((group) => {
            const nodes = ordered(group);
            if (nodes.length === 0) return null;
            return (
              <div key={group.id} className={styles.grp} role="list" aria-label={group.label || "Home"}>
                {group.id === "top" ? null : (
                  <div className={styles.grpHead} style={{ cursor: "default" }}>
                    {group.label}
                    <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
                  </div>
                )}
                {nodes.map((node, index) => {
                  const off = prefs.hidden.includes(node.id);
                  return (
                    <div
                      key={node.id}
                      role="listitem"
                      tabIndex={0}
                      draggable
                      aria-label={`${node.label}${off ? ", in More" : ""}`}
                      className={cn(styles.cz, off && styles.off, drag?.id === node.id && styles.dragging)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", node.id);
                        setDrag({ group: group.id, id: node.id });
                      }}
                      onDragOver={(event) => {
                        if (!drag || drag.group !== group.id) return;
                        event.preventDefault();
                        if (drag.id === node.id) return;
                        setPreview({ group: group.id, ids: move(group, drag.id, index) });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (preview && drag && preview.group === group.id) onOrder(group.id, preview.ids);
                      }}
                      onDragEnd={() => {
                        if (preview && drag && preview.group === drag.group) onOrder(drag.group, preview.ids);
                        setDrag(null);
                        setPreview(null);
                      }}
                      onKeyDown={(event) => {
                        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                        event.preventDefault();
                        onOrder(group.id, move(group, node.id, index + (event.key === "ArrowUp" ? -1 : 1)));
                      }}
                    >
                      <ChromeIcon name="more" className={styles.grip} />
                      <NavIcon name={node.icon} className={styles.ic} />
                      <span className={styles.lbl}>{node.label}</span>
                      <button
                        type="button"
                        className={cn(styles.ib, styles.eye)}
                        aria-label={`${off ? "Show" : "Hide"} ${node.label}`}
                        onClick={() => onHide(node.id)}
                      >
                        <ChromeIcon name={off ? "hide" : "show"} className={styles.ic14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {pinned.length + prefs.pages.length > 0 ? (
            <div className={styles.grp}>
              <div className={styles.grpHead} style={{ cursor: "default" }}>
                Pinned
                <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
              </div>
              {pinned.map((node) => (
                <div key={node.id} className={styles.it}>
                  <Link href={node.href} className={styles.itLink}>
                    <NavIcon name={node.icon} className={styles.ic} />
                    <span className={styles.lbl}>{node.label}</span>
                  </Link>
                </div>
              ))}
              {prefs.pages.map((page) => (
                <div key={page.href} className={styles.it}>
                  <Link href={page.href} className={styles.itLink}>
                    <NavIcon name={page.icon ?? "bookmark"} className={styles.ic} />
                    <span className={styles.lbl}>{page.label}</span>
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
        </nav>
      </div>
      <div className={styles.arrangeFoot}>
        <Button onClick={onReset}>
          <ChromeIcon name="reset" className={styles.ic14} />
          Workspace order
        </Button>
        <Button variant="primary" onClick={onDone}>
          <ChromeIcon name="ready" className={styles.ic14} />
          Done
        </Button>
      </div>
    </aside>
  );
}
