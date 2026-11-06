"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
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
import {
  Button,
  Drawer,
  DrawerSection,
  Person,
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { fetchJson } from "@/lib/api-client";

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

  const [inspectRow, setInspectRow] = React.useState<ApprovalAuditRow | null>(null);

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
      ["Date", "Decision", "Workflow Item", "Approver", "Notes"],
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
    {
      key: "date",
      head: "Timestamp",
      className: "muted mono",
      cell: (r) => new Date(r.createdAt).toLocaleString("en-GB"),
    },
    {
      key: "decision",
      head: "Action / Decision",
      cell: (r) => {
        const tone =
          r.action === "APPROVED"
            ? "done"
            : r.action === "REJECTED"
            ? "bad"
            : r.action === "REQUESTED"
            ? "warn"
            : "void";
        return <St tone={tone}>{r.action}</St>;
      },
    },
    {
      key: "workflow",
      head: "Workflow entity",
      cell: (r) => (
        <span>
          <span className="who" style={{ display: "block", fontWeight: 500 }}>
            {r.sourceType.replace(/_/g, " ")}
          </span>
          <span className="muted mono" style={{ fontSize: 11 }}>
            ID: {r.sourceId.slice(0, 12)}...
          </span>
        </span>
      ),
    },
    {
      key: "actor",
      head: "Decision maker",
      cell: (r) =>
        r.actor ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Person name={r.actor.name} size={24} />
            <span>
              <span className="who" style={{ display: "block", fontWeight: 500 }}>
                {r.actor.name}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                {r.actor.role}
              </span>
            </span>
          </span>
        ) : (
          <span className="muted">Automated Engine</span>
        ),
    },
    {
      key: "comment",
      head: "Notes / Justification",
      className: "muted",
      cell: (r) => r.comment || <None />,
    },
  ];

  return (
    <PeopleShell activeTab="approvals">
      <BkPage screen="approvals" scroll={false}>
        <BkFinding
          fact={`${counts.approved} approvals recorded, ${counts.rejected} rejected, ${counts.pending} pending action.`}
          rest="Audit ledger maintains immutable records of staff leave, payroll approvals, and overtime decisions."
        />

        <BkTabs
          label="Approval audit views"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={[
            { value: "all", label: "All decisions", count: counts.all },
            { value: "approved", label: "Approved", count: counts.approved },
            { value: "pending", label: "Under review", count: counts.pending },
            { value: "rejected", label: "Rejected", count: counts.rejected },
          ]}
        />

        {selection.selected.size > 0 ? (
          <BkSelectionBar
            selection={{
              count: selection.selected.size,
              clear: selection.clear,
            }}
            actions={
              <Button variant="quiet" icon="export" onClick={handleExport}>
                Export selected ({selection.selected.size})
              </Button>
            }
          />
        ) : (
          <BkTools
            find="Search audit trail by approver, entity, notes..."
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            end={<BkQuietTools onExport={handleExport} />}
          />
        )}

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
            onOpen={(r) => setInspectRow(r)}
            empty={
              auditQuery.isLoading ? (
                "Loading approval history..."
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No decisions match the filter.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Audit decisions will record as managers act on leave or compensation requests.
                  </p>
                </div>
              )
            }
          />
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />
      </BkPage>

      {/* Slideout detail drawer for inspecting audit decision */}
      <Drawer
        open={Boolean(inspectRow)}
        onClose={() => setInspectRow(null)}
        title="Approval Audit Decision"
        description="Immutable snapshot of workflow verification."
      >
        {inspectRow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <DrawerSection title="Decision Details">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>Outcome</span>
                  <div style={{ marginTop: 4 }}>
                    <St
                      tone={
                        inspectRow.action === "APPROVED"
                          ? "done"
                          : inspectRow.action === "REJECTED"
                          ? "bad"
                          : "warn"
                      }
                    >
                      {inspectRow.action}
                    </St>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>Date & Time</span>
                  <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}>
                    {new Date(inspectRow.createdAt).toLocaleString("en-GB")}
                  </div>
                </div>
              </div>
            </DrawerSection>

            <DrawerSection title="Entity & Approver">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>Source Type</span>
                  <div style={{ fontWeight: 500, color: "var(--color-ink)", marginTop: 2 }}>
                    {inspectRow.sourceType}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>Decision Maker</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Person name={inspectRow.actor?.name || "System"} size={26} />
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {inspectRow.actor?.name || "Automated Workflow"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                        {inspectRow.actor?.role || "Engine"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DrawerSection>

            <DrawerSection title="Notes">
              <p style={{ fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.5 }}>
                {inspectRow.comment || "No decision notes entered."}
              </p>
            </DrawerSection>
          </div>
        ) : null}
      </Drawer>
    </PeopleShell>
  );
}
