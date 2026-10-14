"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink, Empty, Finding, Icon, Segmented, TableFoot } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { changedWhen } from "@/components/reports/reports-all-view";
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

const STATUS_VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "retired", label: "Retired" },
];

const STATUS_TONE: Record<BuildStatus, string> = { published: "status status-success", draft: "status status-warn", retired: "status" };

/**
 * Build (PageBuildHome): everything the workspace has built — its forms,
 * documents, emails and reports — in one list, each opening in the same
 * builder. Search, Kind, Used by and the status segments narrow it; the query
 * is the address, so the panel's rows are views of this one page. Pure: the
 * page feeds it.
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
  const statusCount = (status: StatusView) => (status === "all" ? narrowed.length : narrowed.filter((item) => item.status === status).length);
  const kinds = BUILD_KINDS.filter((kind) => kind === "report" || counts.kind[kind] > 0 || kindProvisioned(kind, provisions));
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
          <input type="search" aria-label="Search Build" placeholder="Search Build" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          className="chipsel"
          icon="filter"
          label="Kind"
          items={[
            { key: "any", label: "Any kind", checked: !query.kind, onSelect: () => onQuery({ kind: null, page: 1 }) },
            { separator: true },
            ...kinds.map((kind) => ({ key: kind, label: `${BUILD_KIND_LABEL[kind]}s`, checked: query.kind === kind, onSelect: () => onQuery({ kind, page: 1 }) })),
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
            ...users.map((user) => ({ key: user, label: BUILD_USER_LABEL[user], checked: query.used === user, onSelect: () => onQuery({ used: user, page: 1 }) })),
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
        <div className="end" />
      </div>

      <Finding fact={finding.fact} rest={finding.rest} />

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
            Start a form, a document, an email or a report from a template, or press New.
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
      ) : (
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
                      <Link className="cell-lead truncate" href={item.href}>
                        {item.name}
                      </Link>
                    </td>
                    <td className="muted">{BUILD_KIND_LABEL[item.kind]}</td>
                    <td className="bh-used">
                      <span className="truncate" title={`${BUILD_USER_LABEL[item.usedBy]}: ${item.usedFor}`}>
                        {item.usedFor}
                      </span>
                    </td>
                    <td className="bh-wide">{item.isDefault ? <span className="status status-info">Default</span> : <span className="muted">—</span>}</td>
                    <td className="bh-wide num">{item.version ? `v${item.version}` : <span className="muted">—</span>}</td>
                    <td>
                      <span className={STATUS_TONE[item.status]}>{BUILD_STATUS_LABEL[item.status]}</span>
                    </td>
                    <td className="muted bh-wide">{changedWhen(item.updatedAt).replace(/^today$/, "Today").replace(/^yesterday$/, "Yesterday")}</td>
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
  if (kind === "email") return provisions.blocks;
  return provisions.reports;
}
