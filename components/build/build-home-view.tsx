"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink, Empty, Icon, Segmented, TableFoot } from "@/components/core";
import { CrmFinding } from "@/components/crm/crm-finding";
import { MenuButton } from "@/components/core/menu";
import { cn } from "@/lib/utils";
import { changedWhen } from "@/components/reports/reports-all-view";
import { CraftDocCover } from "@/components/build/craft-doc-cover";
import {
  BUILD_KIND_LABEL,
  BUILD_KINDS,
  BUILD_PAGE_SIZE,
  BUILD_STATUS_LABEL,
  filterBuildItems,
  type BuildCounts,
  type BuildItem,
  type BuildKind,
  type BuildQuery,
  type BuildStatus,
} from "@/lib/build/items";
import { BUILD_USER_LABEL, BUILD_USERS, hasUser, type BuildProvisions } from "@/lib/build/provision";

type StatusView = "all" | BuildStatus;
type LayoutView = "list" | "grid";

const STATUS_VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "retired", label: "Retired" },
];

const STATUS_TONE: Record<BuildStatus, string> = {
  published: "status status-success",
  draft: "status status-warn",
  retired: "status",
};

/**
 * Build (PageBuildHome): everything the workspace has built — its forms,
 * documents and emails — in list or grid view, each opening in its builder.
 *
 * Excludes reports (which belong strictly in Reports `/reports`).
 * In list mode: features Craft Docs miniature document thumbnails.
 * In grid mode: features responsive Craft Docs tactile card covers.
 */
export function BuildHomeView({
  items,
  counts,
  finding,
  provisions,
  query,
  onQuery,
}: {
  items: BuildItem[];
  counts: BuildCounts;
  finding: { fact: string; rest: string | null };
  provisions: BuildProvisions;
  query: BuildQuery;
  onQuery: (next: Partial<BuildQuery>) => void;
}) {
  const [q, setQ] = React.useState(query.q);
  const [layout, setLayout] = React.useState<LayoutView>("grid");

  React.useEffect(() => {
    if (q === query.q) return;
    const timer = window.setTimeout(() => onQuery({ q, page: 1 }), 250);
    return () => window.clearTimeout(timer);
  }, [q, query.q, onQuery]);

  const narrowed = filterBuildItems(items, { ...query, status: null });
  const shown = query.status ? narrowed.filter((item) => item.status === query.status) : narrowed;
  const pages = Math.max(1, Math.ceil(shown.length / BUILD_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const start = (page - 1) * BUILD_PAGE_SIZE;
  const rows = shown.slice(start, start + BUILD_PAGE_SIZE);
  const statusCount = (status: StatusView) =>
    status === "all" ? narrowed.length : narrowed.filter((item) => item.status === status).length;
  const kinds = BUILD_KINDS.filter((kind) => counts.kind[kind] > 0 || kindProvisioned(kind, provisions));
  const users = BUILD_USERS.filter((user) => hasUser(provisions, user));
  const clear = () => {
    setQ("");
    onQuery({ q: "", kind: null, used: null, status: null, page: 1 });
  };

  return (
    <div className="kbody">
      <div className="ws-tools">
        <label className="input-wrap ws-find">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search Build"
            placeholder="Search templates & forms"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <MenuButton
          className="chipsel"
          icon="filter"
          label="Kind"
          items={[
            { key: "any", label: "Any kind", checked: !query.kind, onSelect: () => onQuery({ kind: null, page: 1 }) },
            { separator: true },
            ...kinds.map((kind) => ({
              key: kind,
              label: `${BUILD_KIND_LABEL[kind]}s`,
              checked: query.kind === kind,
              onSelect: () => onQuery({ kind, page: 1 }),
            })),
          ]}
        >
          {query.kind ? `${BUILD_KIND_LABEL[query.kind]}s` : "Any kind"}
        </MenuButton>
        <MenuButton
          className="chipsel"
          icon="users"
          label="Used by"
          items={[
            { key: "any", label: "Used by anything", checked: !query.used, onSelect: () => onQuery({ used: null, page: 1 }) },
            { separator: true },
            ...users.map((user) => ({
              key: user,
              label: BUILD_USER_LABEL[user],
              checked: query.used === user,
              onSelect: () => onQuery({ used: user, page: 1 }),
            })),
          ]}
        >
          {query.used ? `Used by ${BUILD_USER_LABEL[query.used]}` : "Used by anything"}
        </MenuButton>
        <Segmented<StatusView>
          label="Status"
          value={query.status ?? "all"}
          onChange={(value) => onQuery({ status: value === "all" ? null : value, page: 1 })}
          items={STATUS_VIEWS.map((view) => ({ value: view.value, label: view.label, count: statusCount(view.value) }))}
        />

        {/* View mode toggle: List vs Grid */}
        <div className="build-layout-switch ml-auto" role="group" aria-label="Layout view">
          <button
            type="button"
            className={`build-layout-btn ${layout === "grid" ? "is-active" : ""}`}
            onClick={() => setLayout("grid")}
            aria-label="Grid view with covers"
            title="Grid view"
          >
            <Icon name="grid" size={16} />
          </button>
          <button
            type="button"
            className={`build-layout-btn ${layout === "list" ? "is-active" : ""}`}
            onClick={() => setLayout("list")}
            aria-label="List view with miniatures"
            title="List view"
          >
            <Icon name="list" size={16} />
          </button>
        </div>
      </div>

      <CrmFinding
        finding={{
          fact: finding.fact,
          rest: finding.rest ? `— ${finding.rest}` : null,
        }}
        className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-2.5"
      />

      {shown.length === 0 ? (
        items.length === 0 ? (
          <Empty
            icon="grid"
            title="Nothing is built here yet"
            action={
              <ButtonLink icon="file" href="/build/templates">
                From a template
              </ButtonLink>
            }
          >
            Start a form, a document or an email from a template, or press New.
          </Empty>
        ) : (
          <Empty
            icon="search"
            title="Nothing matches"
            action={
              <Button icon="x" onClick={clear}>
                Clear the search and filters
              </Button>
            }
          >
            Nothing here is called that, of that kind, or used there.
          </Empty>
        )
      ) : layout === "grid" ? (
        /* Craft Docs Grid View */
        <>
          <div className="build-grid">
            {rows.map((item) => (
              <Link
                key={`${item.source}:${item.id}`}
                href={item.href}
                className="build-card group"
              >
                {/* Craft Docs document preview / cover */}
                <CraftDocCover item={item} variant="card" />

                <div className="build-card-body">
                  <div className="build-card-head">
                    <span className="build-card-title truncate" title={item.name}>
                      {item.name}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          item.status === "published"
                            ? "bg-[var(--tone-success-strong,#15803d)]"
                            : item.status === "draft"
                              ? "bg-[var(--tone-warn-strong,#b45309)]"
                              : "bg-[var(--color-ink-3)]",
                        )}
                      />
                      <span
                        className={cn(
                          item.status === "published"
                            ? "text-[var(--tone-success-strong,#15803d)]"
                            : item.status === "draft"
                              ? "text-[var(--tone-warn-strong,#b45309)]"
                              : "text-[var(--color-ink-3)]",
                        )}
                      >
                        {BUILD_STATUS_LABEL[item.status]}
                      </span>
                    </span>
                  </div>

                  <div className="build-card-meta">
                    <span className="truncate text-sm text-[var(--color-ink-2)]" title={`${BUILD_USER_LABEL[item.usedBy]}: ${item.usedFor}`}>
                      {item.usedFor}
                    </span>
                    <span className="text-[var(--color-ink-3)]">·</span>
                    <span className="text-sm text-[var(--color-ink-2)]">{BUILD_KIND_LABEL[item.kind]}</span>
                  </div>

                  <div className="build-card-foot">
                    <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
                      {changedWhen(item.updatedAt).replace(/^today$/, "Today").replace(/^yesterday$/, "Yesterday")}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
                      {item.version ? `v${item.version}` : item.isDefault ? "Default" : "Custom"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <TableFoot
            range={`${start + 1} to ${start + rows.length} of ${shown.length}`}
            page={
              pages > 1
                ? {
                    onPrevious: page > 1 ? () => onQuery({ page: page - 1 }) : undefined,
                    onNext: page < pages ? () => onQuery({ page: page + 1 }) : undefined,
                  }
                : undefined
            }
          />
        </>
      ) : (
        /* Craft Docs List View with miniature cover thumbnail */
        <>
          <div className="wt">
            <table className="table build-table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col className="bh-used" style={{ width: 200 }} />
                <col className="bh-wide" style={{ width: 96 }} />
                <col className="bh-wide" style={{ width: 84 }} />
                <col style={{ width: 120 }} />
                <col className="bh-wide" style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th className="bh-used">Used by</th>
                  <th className="bh-wide">Default</th>
                  <th className="bh-wide">Version</th>
                  <th>Status</th>
                  <th className="bh-wide">Changed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${item.source}:${item.id}`}>
                    <td className="fill">
                      <Link className="cell-lead flex items-center gap-3" href={item.href}>
                        <CraftDocCover item={item} variant="thumbnail" />
                        <span className="truncate font-medium">{item.name}</span>
                      </Link>
                    </td>
                    <td className="muted">{BUILD_KIND_LABEL[item.kind]}</td>
                    <td className="bh-used">
                      <span className="truncate" title={`${BUILD_USER_LABEL[item.usedBy]}: ${item.usedFor}`}>
                        {item.usedFor}
                      </span>
                    </td>
                    <td className="bh-wide">
                      {item.isDefault ? <span className="status status-info">Default</span> : <span className="muted">—</span>}
                    </td>
                    <td className="bh-wide num">{item.version ? `v${item.version}` : <span className="muted">—</span>}</td>
                    <td>
                      <span className={STATUS_TONE[item.status]}>{BUILD_STATUS_LABEL[item.status]}</span>
                    </td>
                    <td className="muted bh-wide">
                      {changedWhen(item.updatedAt).replace(/^today$/, "Today").replace(/^yesterday$/, "Yesterday")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFoot
            range={`${start + 1} to ${start + rows.length} of ${shown.length}`}
            page={
              pages > 1
                ? {
                    onPrevious: page > 1 ? () => onQuery({ page: page - 1 }) : undefined,
                    onNext: page < pages ? () => onQuery({ page: page + 1 }) : undefined,
                  }
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}

function kindProvisioned(kind: BuildKind, provisions: BuildProvisions): boolean {
  if (kind === "form") return provisions.visitForms || provisions.enquiryForms || provisions.blocks;
  if (kind === "document") return provisions.blocks || provisions.layouts;
  return provisions.blocks;
}
