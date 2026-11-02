"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";

import { Alert } from "@corelithzw/react";
import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { cn } from "@/lib/utils";

import { ListSearch } from "./list-search";
import type { RegisterFinding, RegisterKpi } from "@/components/crm/registers/register-shell";
import { getApiErrorMessage } from "@/lib/api-client";

export type RecordListTab = {
  value: string;
  label: string;
  count?: number | null;
};

function isStructuredFinding(
  finding: RegisterFinding,
): finding is { fact: ReactNode; rest?: ReactNode; end?: ReactNode } {
  return Boolean(finding && typeof finding === "object" && "fact" in finding);
}

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

      {finding ? (
        <div className="crm-bk-finding">
          {isStructuredFinding(finding) ? (
            <>
              <div className="crm-bk-finding-text">
                <span className="crm-bk-finding-fact">{finding.fact}</span>
                {finding.rest ? <span className="crm-bk-finding-rest"> {finding.rest}</span> : null}
              </div>
              {finding.end ? <div className="crm-bk-finding-end">{finding.end}</div> : null}
            </>
          ) : finding && typeof finding === "object" && ("children" in finding || "text" in finding) ? (
            <>
              <div className="crm-bk-finding-text">
                {"label" in finding && finding.label ? <strong className="crm-bk-finding-fact mr-2">{finding.label}</strong> : null}
                {"text" in finding ? finding.text : "children" in finding ? finding.children : null}
              </div>
              {"action" in finding && finding.action ? (
                <div className="crm-bk-finding-end">
                  {typeof finding.action === "object" && finding.action && "label" in finding.action && "onClick" in finding.action ? (
                    <button type="button" className="fl-act" onClick={finding.action.onClick}>
                      {finding.action.label}
                    </button>
                  ) : (
                    finding.action
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="crm-bk-finding-text">{finding as ReactNode}</div>
          )}
        </div>
      ) : null}

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
        <div className="px-6 py-2.5 border-b border-[var(--color-line)] bg-[var(--color-ground)] text-sm text-[var(--color-muted)]">
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
