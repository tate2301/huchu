"use client";

import * as React from "react";

import type { RailArea } from "@/lib/rail/areas";
import type { RailModel } from "@/lib/rail/model";
import { orderRows } from "@/lib/rail/order";

import { RailPanel } from "./rail-panel";
import { RailRow } from "./rail-row";
import { SwitcherRail, type RailMark } from "./switcher-rail";
import styles from "./workspace-rail.module.css";

function markFor(area: RailArea, current: RailArea | null): RailMark {
  return {
    id: area.id,
    label: area.label,
    icon: area.icon,
    href: area.items[0]?.href ?? "#",
    current: area.id === current?.id,
  };
}

/**
 * The rail and the current module's panel, side by side (00-foundations
 * 5.3.1–5.3.3). The panel always shows the module the page belongs to; with
 * none (a page outside the nav), it shows nothing and the rail stands alone.
 */
export function WorkspaceRail({
  model,
  currentArea,
  activeHref,
  badges,
  tile,
  panelShown,
  panelOverlay,
  onCollapse,
  onOpenPanel,
  onNavigate,
  extra,
}: {
  model: RailModel;
  currentArea: RailArea | null;
  activeHref: string | null;
  badges: Record<string, string>;
  tile: React.ReactNode;
  panelShown: boolean;
  panelOverlay?: boolean;
  onCollapse?: () => void;
  onOpenPanel: () => void;
  onNavigate?: () => void;
  extra?: React.ReactNode;
}) {
  const rows = currentArea
    ? orderRows(currentArea.items, {
        label: (item) => item.label,
        rank: (item) => item.rank,
        alphabetical: currentArea.ranked === true,
      })
    : [];

  return (
    <div className={styles.nav}>
      <SwitcherRail
        tile={tile}
        marks={model.areas.map((area) => markFor(area, currentArea))}
        management={model.management ? markFor(model.management, currentArea) : null}
        panelShown={panelShown}
        onOpenPanel={onOpenPanel}
      />
      {panelShown && currentArea ? (
        <RailPanel title={currentArea.label} overlay={panelOverlay} onCollapse={onCollapse} extra={extra}>
          {rows.map((item) => (
            <RailRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              current={item.href === activeHref}
              badge={badges[item.href]}
              onNavigate={onNavigate}
            />
          ))}
        </RailPanel>
      ) : null}
    </div>
  );
}
