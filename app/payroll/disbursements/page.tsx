"use client";

import * as React from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
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
  Field,
  Input,
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchDisbursementBatches,
  fetchPayrollRuns,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

type DisbursementTab = "pending" | "paid" | "all";

type BatchDetails = {
  id: string;
  code: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  totalAmount: number;
  itemCount: number;
  notes?: string | null;
  payrollRun?: {
    runNumber: number;
  };
  items: Array<{
    id: string;
    amount: number;
    employee: { id: string; name: string; employeeId: string };
  }>;
};

export default function DisbursementsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<DisbursementTab>("pending");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [createDrawerOpen, setCreateDrawerOpen] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState(searchParams.get("runId") || "");
  const [batchNotes, setBatchNotes] = React.useState("");
  const [detailsBatchId, setDetailsBatchId] = React.useState<string | null>(null);

  const { data: batchesData } = useQuery({
    queryKey: ["disbursement-batches"],
    queryFn: () => fetchDisbursementBatches({ limit: 100 }),
  });
  const batches = React.useMemo(() => batchesData?.data ?? [], [batchesData]);

  const { data: runsData } = useQuery({
    queryKey: ["payroll-runs", "disbursement-picker"],
    queryFn: () => fetchPayrollRuns({ limit: 100 }),
  });
  const runs = React.useMemo(() => runsData?.data ?? [], [runsData]);

  const approvedRuns = React.useMemo(
    () => runs.filter((r) => r.status === "APPROVED"),
    [runs]
  );

  const { data: batchDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["disbursement-batch-detail", detailsBatchId],
    queryFn: () => fetchJson<BatchDetails>(`/api/payroll/disbursements/${detailsBatchId}`),
    enabled: Boolean(detailsBatchId),
  });

  // Counts
  const pendingCount = React.useMemo(
    () => batches.filter((b) => b.status === "DRAFT" || b.status === "SUBMITTED" || b.status === "PROCESSING").length,
    [batches]
  );
  const paidCount = React.useMemo(
    () => batches.filter((b) => b.status === "PAID" || b.status === "COMPLETED").length,
    [batches]
  );

  // Filtered
  const filteredBatches = React.useMemo(() => {
    let list = [...batches];
    if (tab === "pending") {
      list = list.filter((b) => b.status !== "PAID" && b.status !== "COMPLETED");
    } else if (tab === "paid") {
      list = list.filter((b) => b.status === "PAID" || b.status === "COMPLETED");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.batchNumber.toLowerCase().includes(q) ||
          b.status.toLowerCase().includes(q) ||
          (b.notes && b.notes.toLowerCase().includes(q))
      );
    }
    return list;
  }, [batches, tab, search]);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredBatches.length);
  const pagedBatches = React.useMemo(
    () => filteredBatches.slice((page - 1) * pageSize, page * pageSize),
    [filteredBatches, page, pageSize]
  );

  const ids = React.useMemo(() => pagedBatches.map((b) => b.id), [pagedBatches]);
  const selection = useSelection(ids);

  // Mutations
  const createBatchMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/payroll/disbursements", {
        method: "POST",
        body: JSON.stringify({
          payrollRunId: selectedRunId || approvedRuns[0]?.id,
          notes: batchNotes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Disbursement batch created", variant: "success" });
      setCreateDrawerOpen(false);
      setBatchNotes("");
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
    onError: (err) => {
      toast({ title: "Unable to create batch", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const updateBatchStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      fetchJson(`/api/payroll/disbursements/${id}/${status.toLowerCase()}`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Batch status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  const totalSum = React.useMemo(() => {
    return filteredBatches.reduce((s, b) => s + Number(b.totalAmount), 0);
  }, [filteredBatches]);

  const handleExportCsv = () => {
    const csv = [
      ["Batch Number", "Date", "Status", "Total Amount", "Method"],
      ...filteredBatches.map((b) => [
        b.batchNumber,
        b.createdAt.slice(0, 10),
        b.status,
        String(b.totalAmount),
        b.payoutMethod || "Bank Payout",
      ]),
    ];
    downloadCsv(`disbursement-batches-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const selectedRun = React.useMemo(
    () => runs.find((r) => r.id === (selectedRunId || approvedRuns[0]?.id)) || null,
    [runs, selectedRunId, approvedRuns]
  );

  return (
    <PayrollShell
      activeTab="disbursements"
      title="Salary Disbursements"
      actions={
        <Button
          variant="primary"
          icon="plus"
          shortcut="N"
          onClick={() => {
            if (approvedRuns[0]) setSelectedRunId(approvedRuns[0].id);
            setCreateDrawerOpen(true);
          }}
        >
          Create disbursement
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Disbursement views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "pending", label: "Pending batches", count: pendingCount },
                { value: "paid", label: "Approved & Paid", count: paidCount },
                { value: "all", label: "All batches", count: batches.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search disbursements by batch code, notes..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredBatches.length} of ${batches.length}`}
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Disbursements"
              foot={
                <TableFoot
                  range={filteredBatches.length === 0 ? "None" : `${from} to ${to} of ${filteredBatches.length}`}
                  sums={[{ label: "Total Batched", value: money(totalSum, "USD") }]}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredBatches.length ? () => setPage((p) => p + 1) : undefined,
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
              {filteredBatches.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No disbursement batches found</b>
                  <p className="muted">Use Create disbursement to batch approved payroll runs for bank transfer.</p>
                </div>
              ) : (
                <table className="table" aria-label="Disbursement batches">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all batches"
                      />
                      <th>Batch Code</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th className="num">Total Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedBatches.map((batch) => {
                      const isSelected = selection.isSelected(batch.id);
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "items",
                          label: "View payout items",
                          icon: "invoice",
                          onSelect: () => setDetailsBatchId(batch.id),
                        },
                        { separator: true },
                        ...(batch.status === "DRAFT"
                          ? [
                              {
                                key: "submit",
                                label: "Submit for approval",
                                icon: "check" as const,
                                onSelect: () => updateBatchStatusMutation.mutate({ id: batch.id, status: "SUBMIT" }),
                              },
                            ]
                          : []),
                        ...(batch.status === "SUBMITTED"
                          ? [
                              {
                                key: "approve",
                                label: "Approve batch",
                                icon: "check" as const,
                                onSelect: () => updateBatchStatusMutation.mutate({ id: batch.id, status: "APPROVE" }),
                              },
                            ]
                          : []),
                        ...(batch.status === "APPROVED"
                          ? [
                              {
                                key: "pay",
                                label: "Mark as paid",
                                icon: "card" as const,
                                onSelect: () => updateBatchStatusMutation.mutate({ id: batch.id, status: "PAY" }),
                              },
                            ]
                          : []),
                      ];

                      return (
                        <tr key={batch.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(batch.id)}
                            label={`Select ${batch.batchNumber}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {batch.batchNumber}
                            </div>
                            {batch.notes ? (
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                {batch.notes}
                              </div>
                            ) : null}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {format(new Date(batch.createdAt), "dd MMM yyyy")}
                          </td>
                          <td>
                            <span style={{ fontSize: 13 }}>{batch.payoutMethod || "Bank Payout"}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(Number(batch.totalAmount), "USD")}
                          </td>
                          <td>
                            <BkState
                              tone={
                                batch.status === "PAID" || batch.status === "COMPLETED"
                                  ? "success"
                                  : batch.status === "REJECTED"
                                  ? "danger"
                                  : batch.status === "APPROVED"
                                  ? "info"
                                  : "warning"
                              }
                            >
                              {batch.status}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <Button
                                size="sm"
                                onClick={() => setDetailsBatchId(batch.id)}
                              >
                                View items
                              </Button>
                              <MenuButton label="More" items={moreEntries}>
                                •••
                              </MenuButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* CREATE DISBURSEMENT DRAWER */}
            <Drawer
              open={createDrawerOpen}
              onOpenChange={setCreateDrawerOpen}
              title="Create disbursement batch"
              sub="Prepare an approved payroll run for electronic bank transfer or cash payout."
              width={480}
              footer={
                <>
                  <Button onClick={() => setCreateDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={createBatchMutation.isPending}
                    onClick={() => createBatchMutation.mutate()}
                  >
                    Generate batch
                  </Button>
                </>
              }
            >
              <DrawerSection title="Source Payroll Run">
                <Field label="Approved payroll run" htmlFor="dsb-run">
                  <select
                    id="dsb-run"
                    className="select"
                    value={selectedRun?.id || ""}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    {approvedRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        Run #{r.runNumber} • {money(r.netTotal, "USD")}
                      </option>
                    ))}
                  </select>
                </Field>

                {selectedRun ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: "var(--color-surface)",
                      boxShadow: "var(--shadow-ring)",
                      fontSize: 13,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Total net payout</span>
                      <span className="num" style={{ fontWeight: 600, color: "var(--color-ink)", fontSize: 15 }}>
                        {money(selectedRun.netTotal, "USD")}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Run status</span>
                      <BkState tone="success">{selectedRun.status}</BkState>
                    </div>
                  </div>
                ) : null}

                <Field label="Reference / Notes" htmlFor="dsb-notes" optional>
                  <Input
                    id="dsb-notes"
                    placeholder="e.g. Stanbic Corporate Bank Transfer"
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                  />
                </Field>
              </DrawerSection>
            </Drawer>

            {/* BATCH DETAILS DRAWER */}
            <Drawer
              open={Boolean(detailsBatchId)}
              onOpenChange={(open) => !open && setDetailsBatchId(null)}
              title={batchDetails ? `Batch ${batchDetails.code}` : "Disbursement Details"}
              sub={batchDetails ? `Total: ${money(batchDetails.totalAmount, "USD")} • ${batchDetails.items.length} employees` : "Loading..."}
              width={560}
              footer={<Button onClick={() => setDetailsBatchId(null)}>Close</Button>}
            >
              {detailsLoading ? (
                <div style={{ padding: 24, textAlign: "center" }} className="muted">
                  Loading payout lines...
                </div>
              ) : batchDetails ? (
                <table className="table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th className="num">Payout Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchDetails.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Person name={item.employee.name} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{item.employee.name}</div>
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                {item.employee.employeeId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                          {money(item.amount, "USD")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PayrollShell>
  );
}
