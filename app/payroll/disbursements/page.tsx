"use client";

import * as React from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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
  Field,
  Input,
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
  const pageSize = 20;

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
    queryFn: () => fetchPayrollRuns({ limit: 50 }),
  });
  const approvedRuns = React.useMemo(
    () => (runsData?.data ?? []).filter((r) => r.status === "APPROVED"),
    [runsData]
  );

  const { data: batchDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["disbursement-batch-details", detailsBatchId],
    queryFn: () => fetchJson<BatchDetails>(`/api/payroll/disbursements/${detailsBatchId}`),
    enabled: Boolean(detailsBatchId),
  });

  // Tab subsets
  const pendingBatches = React.useMemo(
    () => batches.filter((b) => b.status === "DRAFT" || b.status === "SUBMITTED" || b.status === "APPROVED"),
    [batches]
  );
  const paidBatches = React.useMemo(() => batches.filter((b) => b.status === "PAID"), [batches]);

  // Mutations
  const createBatchMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/payroll/disbursements", {
        method: "POST",
        body: JSON.stringify({
          payrollRunId: selectedRunId,
          notes: batchNotes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Disbursement batch created" });
      setCreateDrawerOpen(false);
      setBatchNotes("");
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
    onError: (err) => {
      toast({ title: "Failed to create batch", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const submitBatchMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/payroll/disbursements/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disbursement batch submitted" });
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  const approveBatchMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/payroll/disbursements/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disbursement batch approved" });
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/payroll/disbursements/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disbursement marked as paid" });
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  // Filtered
  const currentList = tab === "pending" ? pendingBatches : tab === "paid" ? paidBatches : batches;
  const filteredBatches = React.useMemo(() => {
    let list = [...currentList];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.code.toLowerCase().includes(q) ||
          b.status.toLowerCase().includes(q) ||
          (b.notes && b.notes.toLowerCase().includes(q))
      );
    }
    return list;
  }, [currentList, search]);

  const totalSum = React.useMemo(
    () => filteredBatches.reduce((sum, b) => sum + b.totalAmount, 0),
    [filteredBatches]
  );

  const totalRows = filteredBatches.length;
  const pageRows = React.useMemo(
    () => filteredBatches.slice((page - 1) * pageSize, page * pageSize),
    [filteredBatches, page, pageSize]
  );

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const handleExportCsv = () => {
    downloadCsv(
      `disbursements-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Batch Code", "Created Date", "Recipients", "Status", "Total Amount", "Notes"],
      filteredBatches.map((b) => [
        b.code,
        b.createdAt ? String(b.createdAt).slice(0, 10) : "",
        String(b.itemCount),
        b.status,
        String(b.totalAmount),
        b.notes || "",
      ])
    );
  };

  const columns: Array<WsColumn<BatchDetails | (typeof batches)[number]>> = [
    {
      key: "code",
      head: "Batch code",
      cell: (b) => (
        <div>
          <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>{b.code}</div>
          {b.notes ? (
            <div className="muted" style={{ fontSize: 11 }}>
              {b.notes}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "date",
      head: "Created date",
      className: "muted mono",
      cell: (b) => (b.createdAt ? format(new Date(b.createdAt), "dd MMM yyyy") : <None />),
    },
    {
      key: "count",
      head: "Recipients",
      className: "mono",
      cell: (b) => `${b.itemCount} employees`,
    },
    {
      key: "amount",
      head: "Total Amount",
      right: true,
      cell: (b) => <Amt value={b.totalAmount} currency="USD" weight={600} />,
    },
    {
      key: "status",
      head: "Status",
      cell: (b) => {
        const tone =
          b.status === "PAID"
            ? "done"
            : b.status === "REJECTED"
            ? "bad"
            : b.status === "APPROVED"
            ? "info"
            : "warn";
        return <St tone={tone}>{b.status}</St>;
      },
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (b) => {
        const moreEntries: MenuEntry[] = [
          {
            key: "inspect",
            label: "Inspect batch lines",
            icon: "invoice",
            onSelect: () => setDetailsBatchId(b.id),
          },
          ...(b.status === "DRAFT"
            ? [
                {
                  key: "submit",
                  label: "Submit batch",
                  icon: "check" as const,
                  onSelect: () => submitBatchMutation.mutate(b.id),
                },
              ]
            : []),
          ...(b.status === "SUBMITTED"
            ? [
                {
                  key: "approve",
                  label: "Approve batch",
                  icon: "check" as const,
                  onSelect: () => approveBatchMutation.mutate(b.id),
                },
              ]
            : []),
        ];

        return (
          <div
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            {b.status === "APPROVED" ? (
              <Button
                size="sm"
                variant="primary"
                busy={markPaidMutation.isPending}
                onClick={() => markPaidMutation.mutate(b.id)}
              >
                Mark paid
              </Button>
            ) : null}
            <MenuButton label="More actions" items={moreEntries} />
          </div>
        );
      },
    },
  ];

  const totals = [
    `${totalRows} batches`,
    null,
    null,
    <Amt key="tot" value={totalSum} currency="USD" weight={600} />,
    `${pendingBatches.length} pending`,
    null,
  ];

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
            if (approvedRuns.length > 0 && !selectedRunId) {
              setSelectedRunId(approvedRuns[0]!.id);
            }
            setCreateDrawerOpen(true);
          }}
        >
          New disbursement batch
        </Button>
      }
    >
      <BkPage screen="payroll-disbursements" scroll={false}>
        <BkFinding
          fact={
            tab === "pending"
              ? `${pendingBatches.length} pending disbursement batches awaiting release or sign-off.`
              : tab === "paid"
              ? `${paidBatches.length} settled disbursement batches transferred to staff.`
              : `${batches.length} disbursement batches tracked on file.`
          }
          rest="Select any batch to inspect payment lines, verify bank details, or record payment settlement."
        />

        <BkTabs
          label="Disbursement views"
          value={tab}
          onChange={(next) => {
            setTab(next as DisbursementTab);
            setPage(1);
            selection.clear();
          }}
          items={[
            { value: "pending", label: "Pending batches", count: pendingBatches.length },
            { value: "paid", label: "Paid batches", count: paidBatches.length },
            { value: "all", label: "All batches", count: batches.length },
          ]}
        />

        {selection.selected.size > 0 ? (
          <BkSelectionBar
            selection={{
              count: selection.selected.size,
              clear: selection.clear,
            }}
            actions={
              <Button variant="quiet" icon="export" onClick={handleExportCsv}>
                Export selected ({selection.selected.size})
              </Button>
            }
          />
        ) : (
          <BkTools
            find="Search batches by code, status, or reference..."
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            end={<BkQuietTools onExport={handleExportCsv} />}
          />
        )}

        <BkScroll>
          <Worksheet
            label="disbursement batches"
            rows={pageRows}
            rowKey={(b) => b.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (b) => b.code,
            }}
            totals={totals}
            onOpen={(b) => setDetailsBatchId(b.id)}
            empty={
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                  No disbursement batches match this view.
                </p>
                <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                  Create a new payout batch from an approved salary run.
                </p>
              </div>
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

      {/* CREATE BATCH DRAWER */}
      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="Create disbursement batch"
        sub="Bundle approved salary run payouts into a bank release batch."
        width={480}
        footer={
          <>
            <Button onClick={() => setCreateDrawerOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon="check"
              shortcut="Ctrl ↵"
              busy={createBatchMutation.isPending}
              disabled={!selectedRunId}
              onClick={() => createBatchMutation.mutate()}
            >
              Create batch
            </Button>
          </>
        }
      >
        <DrawerSection title="Source Payroll Run">
          <Field label="Approved payroll run" htmlFor="batch-run">
            <select
              id="batch-run"
              className="select"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={{ width: "100%", height: 36 }}
            >
              {approvedRuns.length === 0 ? (
                <option value="">No approved runs available</option>
              ) : (
                approvedRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run #{r.runNumber} • {money(r.netTotal, "USD")}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Batch notes / Description" htmlFor="batch-notes" optional>
            <Input
              id="batch-notes"
              placeholder="e.g. Standard Bank Electronic Transfer"
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
            />
          </Field>
        </DrawerSection>
      </Drawer>

      {/* BATCH LINE ITEMS INSPECTION DRAWER */}
      <Drawer
        open={Boolean(detailsBatchId)}
        onOpenChange={(open) => !open && setDetailsBatchId(null)}
        title={batchDetails ? `Batch ${batchDetails.code}` : "Disbursement Details"}
        sub={
          batchDetails
            ? `${batchDetails.itemCount} recipients • Total ${money(batchDetails.totalAmount, "USD")}`
            : "Loading..."
        }
        width={640}
        footer={<Button onClick={() => setDetailsBatchId(null)}>Close</Button>}
      >
        {detailsLoading ? (
          <div style={{ padding: 24, textAlign: "center" }} className="muted">
            Loading batch line items...
          </div>
        ) : batchDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <table className="bkt" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Disbursement Amount</th>
                </tr>
              </thead>
              <tbody>
                {batchDetails.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                        {item.employee.name}
                      </div>
                      <div className="muted mono" style={{ fontSize: 11 }}>
                        {item.employee.employeeId}
                      </div>
                    </td>
                    <td className="num">
                      <Amt value={item.amount} currency="USD" weight={600} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Drawer>
    </PayrollShell>
  );
}
