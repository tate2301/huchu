"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";

import { Alert } from "@corelithzw/react";
import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { cn } from "@/lib/utils";

import { ListSearch } from "./list-search";
import type { LucideIcon } from "@/lib/icons";
import type { RegisterFinding, RegisterKpi } from "@/components/crm/registers/register-shell";
import { CrmFinding } from "@/components/crm/crm-finding";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  ci_alert,
  ci_apps,
  ci_calendar_clock,
  ci_check_circle,
  ci_pipeline,
  ci_table,
  ci_user,
  ci_x_circle,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";

function getViewGlyph(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("all")) return ci_apps;
  if (lower.includes("my") || lower.includes("mine")) return ci_user;
  if (lower.includes("won") || lower.includes("done") || lower.includes("complete")) return ci_check_circle;
  if (lower.includes("lost") || lower.includes("archived")) return ci_x_circle;
  if (lower.includes("pipeline") || lower.includes("open") || lower.includes("deal")) return ci_pipeline;
  if (lower.includes("scheduled") || lower.includes("upcoming")) return ci_calendar_clock;
  if (lower.includes("urgent") || lower.includes("overdue") || lower.includes("attention")) return ci_alert;
  return ci_table;
}

export type RecordListTab = {
  value: string;
  label: string;
  count?: number | null;
  icon?: LucideIcon | ReactNode;
};

/**
 * The frame every CRM record list shares: title, Books finding banner, optional
 * KPI strip, Books view tabs row, worksheet tools row, and full-bleed records.
 */
export function RecordListShell({
  title,
  search,
  onSearchChange,
  searchPlaceholder,
  searchNoun,
  layout,
  filters,
  display,
  count,
  createLabel,
  onCreate,
  error,
  notice,
  finding,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  width = "full",
  children,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchNoun?: string;
  layout?: ReactNode;
  filters?: ReactNode;
  display?: ReactNode;
  filterCount?: number;
  count?: ReactNode;
  createLabel?: string;
  onCreate?: () => void;
  error?: unknown;
  notice?: ReactNode;
  finding?: RegisterFinding | null;
  kpis?: RegisterKpi[];
  tabs?: RecordListTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  width?: "full" | "narrow";
  children: ReactNode;
}) {
  const onCreateRef = useRef(onCreate);
  useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);
  const hasCreate = Boolean(createLabel && onCreate);
  const primary = useMemo<PagePrimary | null>(
    () =>
      hasCreate && createLabel
        ? { label: createLabel, icon: "plus", onClick: () => onCreateRef.current?.() }
        : null,
    [createLabel, hasCreate],
  );

  return (
    <div
      className={cn("crm-bk-worksheet", width === "narrow" && "max-w-3xl")}
      style={
        {
          "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))",
        } as CSSProperties
      }
    >
      <PageChrome title={title} primary={primary} />

      {finding ? <CrmFinding finding={finding} /> : null}

      {kpis && kpis.length > 0 ? (
        <div className="crm-bk-strip">
          <div
            className="crm-bk-kstrip"
            style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}
          >
            {kpis.map((kpi) => (
              <div className="crm-bk-kt" key={kpi.label}>
                <span className="crm-bk-kt-l">{kpi.label}</span>
                <span className="crm-bk-kt-v">{kpi.value}</span>
                {kpi.note ? <span className="crm-bk-kt-n">{kpi.note}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="px-6 py-2.5 border-b border-[var(--color-line)] bg-[var(--color-ground)] text-sm text-[var(--color-ink-2)]">
          {notice}
        </div>
      ) : null}

      {tabs && tabs.length > 0 ? (
        <div className="crm-bk-tabs-bar">
          <div className="crm-bk-tabs" role="tablist" aria-label={`${title} views`}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="crm-bk-tab"
                  onClick={() => onTabChange?.(tab.value)}
                >
                  {tab.icon ? (
                    typeof tab.icon === "function" ? (
                      <tab.icon className="size-4 shrink-0" data-current={selected || undefined} />
                    ) : (
                      tab.icon
                    )
                  ) : (
                    <CiGlyphIcon glyph={getViewGlyph(tab.label)} size={16} className="shrink-0" />
                  )}
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" ? (
                    <span className="n">{tab.count.toLocaleString("en-US")}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {layout ? <div className="crm-bk-tabs-end">{layout}</div> : null}
        </div>
      ) : null}

      <div className="crm-bk-tools">
        <div className="crm-bk-tools-start">
          <ListSearch
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            noun={searchNoun ?? title.toLowerCase()}
            narrow
          />
          {filters}
          {count ? <span className="crm-bk-count">{count}</span> : null}
        </div>
        {display || (!tabs?.length && layout) ? (
          <div className="crm-bk-tools-end">
            {!tabs?.length && layout ? layout : null}
            {display}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="p-6">
          <Alert tone="danger" title={`The ${title.toLowerCase()} would not load`}>
            {getApiErrorMessage(error)}
          </Alert>
        </div>
      ) : null}

      <div className="crm-bk-bleed-reset" style={{ "--stack-top": "var(--stack-next)" } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
