"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import {
  BkChip,
  BkQuietTools,
  BkState,
  BkTabs,
  BkTools,
  downloadCsv,
} from "@/components/books/bk-list";
import {
  Button,
  Drawer,
  DrawerSection,
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { fetchApprovalHistory, type ApprovalHistoryRecord } from "@/lib/api";

type DecisionTab = "all" | "approved" | "pending" | "rejected";

function actionTone(action: string): "success" | "warning" | "danger" | "info" | "plain" {
  if (/approve/i.test(action)) return "success";
  if (/reject|cancel|deny/i.test(action)) return "danger";
  if (/submit|pending|review/i.test(action)) return "warning";
  return "plain";
}

export default function ApprovalsPage() {
  const [tab, setTab] = React.useState<DecisionTab>("all");
  const [entityType, setEntityType] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const [selectedRecord, setSelectedRecord] = React.useState<ApprovalHistoryRecord | null>(null);

  const { data } = useQuery({
    queryKey: ["approval-history", entityType, search],
    queryFn: () =>
      fetchApprovalHistory({
        entityType: entityType === "all" ? undefined : entityType,
        search: search || undefined,
        limit: 250,
      }),
  });

  const records = React.useMemo(() => data?.data ?? [], [data]);

  // Tab filtering
  const filteredRecords = React.useMemo(() => {
    let list = [...records];
    if (tab === "approved") {
      list = list.filter((r) => /approve/i.test(r.action));
    } else if (tab === "pending") {
      list = list.filter((r) => /submit|pending|review/i.test(r.action));
    } else if (tab === "rejected") {
      list = list.filter((r) => /reject|cancel|deny/i.test(r.action));
    }
    return list;
  }, [records, tab]);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredRecords.length);
  const pagedRecords = React.useMemo(
    () => filteredRecords.slice((page - 1) * pageSize, page * pageSize),
    [filteredRecords, page, pageSize]
  );

  const ids = React.useMemo(() => pagedRecords.map((r) => r.id), [pagedRecords]);
  const selection = useSelection(ids);

  const approvedCount = React.useMemo(() => records.filter((r) => /approve/i.test(r.action)).length, [records]);
  const pendingCount = React.useMemo(() => records.filter((r) => /submit|pending|review/i.test(r.action)).length, [records]);
  const rejectedCount = React.useMemo(() => records.filter((r) => /reject|cancel|deny/i.test(r.action)).length, [records]);

  const handleExportCsv = () => {
    const csv = [
      ["Entity Type", "Entity ID", "Action", "Actor Name", "Actor Role", "Date", "Comments"],
      ...filteredRecords.map((r) => [
        r.entityType,
        r.entityId,
        r.action,
        r.actor?.name || "",
        r.actorRole || "",
        format(new Date(r.createdAt), "yyyy-MM-dd HH:mm"),
        r.comments || "",
      ]),
    ];
    downloadCsv(`approvals-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const entityTypeLabel =
    entityType === "all"
      ? "All types"
      : entityType.charAt(0) + entityType.slice(1).toLowerCase();

  return (
    <PeopleShell activeTab="approvals" title="Approval History & Audit Trail">
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Approval views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "all", label: "All decisions", count: records.length },
                { value: "approved", label: "Approved", count: approvedCount },
                { value: "pending", label: "Under review", count: pendingCount },
                { value: "rejected", label: "Rejected / Denied", count: rejectedCount },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search by actor, entity ID, or comment..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredRecords.length} of ${records.length}`}
              chips={
                <BkChip
                  label="Type"
                  value={entityTypeLabel}
                  set={entityType !== "all"}
                  items={[
                    { key: "all", label: "All types", checked: entityType === "all", onSelect: () => setEntityType("all") },
                    { separator: true },
                    { key: "LEAVE_REQUEST", label: "Leave Requests", checked: entityType === "LEAVE_REQUEST", onSelect: () => setEntityType("LEAVE_REQUEST") },
                    { key: "PAYROLL_RUN", label: "Payroll Runs", checked: entityType === "PAYROLL_RUN", onSelect: () => setEntityType("PAYROLL_RUN") },
                    { key: "OVERTIME", label: "Overtime Requests", checked: entityType === "OVERTIME", onSelect: () => setEntityType("OVERTIME") },
                    { key: "DISBURSEMENT", label: "Disbursements", checked: entityType === "DISBURSEMENT", onSelect: () => setEntityType("DISBURSEMENT") },
                  ]}
                />
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Approval decisions"
              foot={
                <TableFoot
                  range={filteredRecords.length === 0 ? "None" : `${from} to ${to} of ${filteredRecords.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredRecords.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selection.selected.size,
                    onClear: selection.clear,
                    actions: (
                      <Button icon="export" onClick={handleExportCsv}>
                        Export selected
                      </Button>
                    ),
                  }}
                />
              }
            >
              {filteredRecords.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No approval decisions match</b>
                  <p className="muted">Clear the search or entity type filter to see more.</p>
                </div>
              ) : (
                <table className="table" aria-label="Approval history">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 130 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all rows"
                      />
                      <th>Request / Entity</th>
                      <th>Decided by</th>
                      <th>Role</th>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((record) => {
                      const isSelected = selection.isSelected(record.id);
                      return (
                        <tr
                          key={record.id}
                          className={isSelected ? "is-selected" : undefined}
                          onClick={() => setSelectedRecord(record)}
                          style={{ cursor: "pointer" }}
                        >
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(record.id)}
                            label={`Select decision ${record.id}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {record.entityType.replace(/_/g, " ")}
                            </div>
                            <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                              ID: {record.entityId.slice(0, 12)}...
                            </div>
                          </td>
                          <td>
                            {record.actor?.name ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Person name={record.actor.name} />
                                <span style={{ fontWeight: 500 }}>{record.actor.name}</span>
                              </div>
                            ) : (
                              <span className="muted">System Automation</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
                              {record.actorRole || "—"}
                            </span>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {format(new Date(record.createdAt), "dd MMM yyyy HH:mm")}
                          </td>
                          <td>
                            <BkState tone={actionTone(record.action)}>
                              {record.action.replace(/_/g, " ")}
                            </BkState>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, color: "var(--color-ink-2)" }}>
                              {record.comments || "—"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* DECISION DETAILS DRAWER */}
            <Drawer
              open={Boolean(selectedRecord)}
              onOpenChange={(open) => !open && setSelectedRecord(null)}
              title="Approval decision detail"
              sub={selectedRecord ? `${selectedRecord.entityType.replace(/_/g, " ")} • ${selectedRecord.action}` : "Detail"}
              width={480}
              footer={<Button onClick={() => setSelectedRecord(null)}>Close</Button>}
            >
              {selectedRecord ? (
                <>
                  <DrawerSection title="Decision Info">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Action taken</span>
                        <BkState tone={actionTone(selectedRecord.action)}>
                          {selectedRecord.action}
                        </BkState>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Decided by</span>
                        <b>{selectedRecord.actor?.name || "System"}</b>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Role</span>
                        <span>{selectedRecord.actorRole || "Approver"}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Timestamp</span>
                        <span className="num">
                          {format(new Date(selectedRecord.createdAt), "yyyy-MM-dd HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  </DrawerSection>

                  <DrawerSection title="Request Context">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Entity category</span>
                        <span>{selectedRecord.entityType}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted">Entity reference ID</span>
                        <span className="num" style={{ fontSize: 12 }}>{selectedRecord.entityId}</span>
                      </div>
                      {selectedRecord.comments ? (
                        <div style={{ marginTop: 8, padding: 12, borderRadius: 6, background: "var(--color-surface)" }}>
                          <span className="muted" style={{ display: "block", marginBottom: 4 }}>
                            Comments / Decision justification:
                          </span>
                          <p style={{ margin: 0, color: "var(--color-ink)" }}>
                            {selectedRecord.comments}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </DrawerSection>
                </>
              ) : null}
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
