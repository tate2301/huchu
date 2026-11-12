"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BkEmpty,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkSelectionBar,
  BkTabs,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { BooksLoading } from "@/components/books/books-state";
import { Button, Person, useSelection } from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { fetchJson } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";

const ACTION_LABEL: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const WHAT: Record<string, { label: string; href?: (id: string) => string }> = {
  PAYROLL_RUN: { label: "Pay run", href: (id) => `/payroll/runs/${id}` },
  DISBURSEMENT_BATCH: { label: "Payout batch", href: (id) => `/payroll/disbursements/${id}` },
  DISCIPLINARY_ACTION: { label: "Disciplinary action" },
  LEAVE_REQUEST: { label: "Leave request" },
  ADJUSTMENT_ENTRY: { label: "Pay adjustment" },
};

type ApprovalAuditRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  action: "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  comment: string | null;
  createdAt: string;
  actor: { id: string; name: string; role: string } | null;
};

export default function PeopleApprovalsPage() {
  const [tab, setTab] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  const auditQuery = useQuery({
    queryKey: ["people-approvals-audit", tab],
    queryFn: () =>
      fetchJson<{ data: ApprovalAuditRow[] }>("/api/v2/people/approvals/audit?limit=200"),
  });

  const records = React.useMemo(() => auditQuery.data?.data ?? [], [auditQuery.data]);

  const filtered = React.useMemo(() => {
    return records.filter((r) => {
      if (tab === "approved" && r.action !== "APPROVED") return false;
      if (tab === "rejected" && r.action !== "REJECTED") return false;
      if (tab === "pending" && r.action !== "REQUESTED") return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const actor = (r.actor?.name || "").toLowerCase();
      const type = r.sourceType.toLowerCase();
      const comment = (r.comment || "").toLowerCase();
      return actor.includes(q) || type.includes(q) || comment.includes(q);
    });
  }, [records, tab, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const selectedRows = React.useMemo(
    () => pageRows.filter((r) => selection.isSelected(r.id)),
    [pageRows, selection]
  );

  const handleExport = () => {
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "approval-audit-trail.csv",
      ["Date", "Decision", "What", "Decided by", "Note"],
      target.map((r) => [
        r.createdAt,
        r.action,
        r.sourceType,
        r.actor?.name || "System",
        r.comment || "",
      ])
    );
  };

  const counts = React.useMemo(() => {
    const approved = records.filter((r) => r.action === "APPROVED").length;
    const rejected = records.filter((r) => r.action === "REJECTED").length;
    const pending = records.filter((r) => r.action === "REQUESTED").length;
    return { all: records.length, approved, rejected, pending };
  }, [records]);

  const columns: Array<WsColumn<ApprovalAuditRow>> = [
    { key: "date", head: "When", className: "mono", cell: (r) => `${shortDay(r.createdAt.slice(0, 10))}, ${r.createdAt.slice(11, 16)}` },
    {
      key: "decision",
      head: "Decision",
      cell: (r) => <St tone={r.action === "APPROVED" ? "done" : r.action === "REJECTED" ? "bad" : r.action === "REQUESTED" ? "warn" : "void"}>{ACTION_LABEL[r.action] ?? r.action}</St>,
    },
    {
      key: "workflow",
      head: "What",
      cell: (r) => {
        const what = WHAT[r.sourceType];
        const label = what?.label ?? r.sourceType.toLowerCase().replace(/_/g, " ");
        return what?.href ? <a href={what.href(r.sourceId)}>{label}</a> : label;
      },
    },
    { key: "actor", head: "Decided by", cell: (r) => (r.actor ? <Person name={r.actor.name} sub={r.actor.role.toLowerCase().replace(/_/g, " ")} /> : <span className="muted">System</span>) },
    { key: "comment", head: "Note", className: "muted", cell: (r) => r.comment || <None /> },
  ];

  return (
    <PeopleShell activeTab="approvals" title="Approvals">
      <BkPage screen="approvals" scroll={false}>
        <BkFinding fact={`${counts.pending} waiting, ${counts.approved} approved, ${counts.rejected} rejected.`} />

        <BkTabs
          label="Approval views"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={[
            { value: "all", label: "All", count: counts.all, icon: "list" },
            { value: "approved", label: "Approved", count: counts.approved, icon: "done" },
            { value: "pending", label: "Waiting", count: counts.pending, icon: "clock" },
            { value: "rejected", label: "Rejected", count: counts.rejected, icon: "issue" },
          ]}
        />

        <BkTools
          find="Search approvals"
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="approval decisions"
            rows={pageRows}
            rowKey={(r) => r.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (r) => `${r.sourceType} decision`,
            }}
            empty={auditQuery.isLoading ? <BooksLoading /> : <BkEmpty>No decisions here.</BkEmpty>}
          />
        </BkScroll>

        <BkPager page={page} size={pageSize} total={totalRows} onPage={setPage} />

        <BkSelectionBar count={selection.selected.size} onClear={selection.clear}>
          <Button icon="export" onClick={handleExport}>
            Export
          </Button>
        </BkSelectionBar>
      </BkPage>
    </PeopleShell>
  );
}
