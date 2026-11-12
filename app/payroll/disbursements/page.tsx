"use client";

import * as React from "react";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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
import {
  Button,
  ButtonGroup,
  Check,
  Drawer,
  DrawerRow,
  DrawerSection,
  Field,
  Input,
  Select,
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
  cashCustodian?: string | null;
  cashIssuedAt?: string | null;
  createdAt?: string | null;
  payrollRun?: {
    runNumber: number;
  };
  items: Array<{
    id: string;
    amount: number;
    employee: { id: string; name: string; employeeId: string };
  }>;
};

function DisbursementsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const urlTab = searchParams.get("tab") as DisbursementTab | null;
  const urlSearch = searchParams.get("q") ?? "";
  const urlPage = Number.parseInt(searchParams.get("page") ?? "1", 10);

  const [tab, setTab] = React.useState<DisbursementTab>(
    urlTab === "paid" || urlTab === "all" ? urlTab : "pending"
  );
  const [search, setSearch] = React.useState(urlSearch);
  const [page, setPage] = React.useState(Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1);
  const pageSize = 20;

  // Sync state to URL
  const updateUrl = React.useCallback(
    (next: { tab?: string; q?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "pending") params.delete("tab");
        else params.set("tab", next.tab);
      }
      if (next.q !== undefined) {
        if (!next.q) params.delete("q");
        else params.set("q", next.q);
      }
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Drawer states
  const [createDrawerOpen, setCreateDrawerOpen] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState(searchParams.get("runId") || "");
  const [batchNotes, setBatchNotes] = React.useState("");
  const [detailsBatchId, setDetailsBatchId] = React.useState<string | null>(null);

  // Dual-custodian sign-off drawer
  const [signOffBatchId, setSignOffBatchId] = React.useState<string | null>(null);
  const [custodianName, setCustodianName] = React.useState("");
  const [handoverRef, setHandoverRef] = React.useState("");
  const [signOffNotes, setSignOffNotes] = React.useState("");
  const [cashVerified, setCashVerified] = React.useState(false);

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

  const activeInspectBatchId = detailsBatchId ?? signOffBatchId;
  const { data: batchDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["disbursement-batch-details", activeInspectBatchId],
    queryFn: () =>
      fetchJson<BatchDetails>(`/api/disbursements/batches/${activeInspectBatchId}`),
    enabled: Boolean(activeInspectBatchId),
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
      fetchJson("/api/disbursements/batches", {
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
      fetchJson(`/api/disbursements/batches/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disbursement batch submitted" });
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  const approveBatchMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/disbursements/batches/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disbursement batch approved" });
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({
      id,
      cashCustodian,
      items,
    }: {
      id: string;
      cashCustodian: string;
      items: Array<{ id: string; paidAmount: number; receiptReference?: string; notes?: string }>;
    }) =>
      fetchJson(`/api/disbursements/batches/${id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          cashCustodian,
          items,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Dual-custodian payout authorized and marked as paid" });
      setSignOffBatchId(null);
      setCustodianName("");
      setHandoverRef("");
      setSignOffNotes("");
      setCashVerified(false);
      void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
      void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (err) => {
      toast({ title: "Payout authorization failed", description: getApiErrorMessage(err), variant: "destructive" });
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
          (b.notes && b.notes.toLowerCase().includes(q)) ||
          (b.cashCustodian && b.cashCustodian.toLowerCase().includes(q))
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
      ["Batch Code", "Created Date", "Recipients", "Status", "Total Amount", "Custodian", "Notes"],
      filteredBatches.map((b) => [
        b.code,
        b.createdAt ? String(b.createdAt).slice(0, 10) : "",
        String(b.itemCount),
        b.status,
        String(b.totalAmount),
        b.cashCustodian || "",
        b.notes || "",
      ])
    );
  };

  const columns: Array<WsColumn<BatchDetails | (typeof batches)[number]>> = [
    {
      key: "code",
      head: "Batch code",
      cell: (b) => (
        <>
          {b.code}
          {b.cashCustodian ? <span className="muted"> Custodian {b.cashCustodian}</span> : null}
          {b.notes ? <span className="muted truncate"> {b.notes}</span> : null}
        </>
      ),
    },
    {
      key: "date",
      head: "Created",
      className: "muted mono",
      cell: (b) => (b.createdAt ? format(new Date(b.createdAt), "dd MMM yyyy") : <None />),
    },
    {
      key: "count",
      head: "Recipients",
      className: "mono",
      cell: (b) => `${b.itemCount} ${b.itemCount === 1 ? "employee" : "employees"}`,
    },
    {
      key: "amount",
      head: "Total",
      right: true,
      cell: (b) => <Amt value={b.totalAmount} currency="USD" className="font-medium" />,
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
        return <St tone={tone}>{BATCH_STATUS[b.status] ?? b.status}</St>;
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
            label: "See the lines",
            icon: "invoice",
            onSelect: () => setDetailsBatchId(b.id),
          },
          ...(b.status === "DRAFT"
            ? [
                {
                  key: "submit",
                  label: "Send for approval",
                  icon: "check" as const,
                  onSelect: () => submitBatchMutation.mutate(b.id),
                },
              ]
            : []),
          ...(b.status === "SUBMITTED"
            ? [
                {
                  key: "approve",
                  label: "Approve",
                  icon: "check" as const,
                  onSelect: () => approveBatchMutation.mutate(b.id),
                },
              ]
            : []),
          ...(b.status === "APPROVED"
            ? [
                {
                  key: "signoff",
                  label: "Sign off and mark paid",
                  icon: "bank" as const,
                  onSelect: () => setSignOffBatchId(b.id),
                },
              ]
            : []),
        ];

        return (
          <ButtonGroup onClick={(e) => e.stopPropagation()}>
            {b.status === "APPROVED" ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setSignOffBatchId(b.id)}
              >
                Mark paid
              </Button>
            ) : null}
            <MenuButton label="More actions" items={moreEntries} />
          </ButtonGroup>
        );
      },
    },
  ];

  const totals = [
    `${totalRows} batches`,
    null,
    null,
    <Amt key="tot" value={totalSum} currency="USD" className="font-medium" />,
    `${pendingBatches.length} pending`,
    null,
  ];

  const signOffTargetBatch = React.useMemo(() => {
    if (!signOffBatchId) return null;
    return batches.find((b) => b.id === signOffBatchId) ?? batchDetails;
  }, [signOffBatchId, batches, batchDetails]);

  return (
    <PayrollShell
      activeTab="disbursements"
      title="Disbursements"
      primary={{
        label: "New batch",
        icon: "plus",
        shortcut: "N",
        onClick: () => {
          if (approvedRuns.length > 0 && !selectedRunId) {
            setSelectedRunId(approvedRuns[0].id);
          }
          setCreateDrawerOpen(true);
        },
      }}
    >
      <BkPage screen="disbursements" scroll={false}>
        <BkFinding
          fact={`${pendingBatches.length} ${pendingBatches.length === 1 ? "batch" : "batches"} waiting to be paid.`}
        />

        <BkTabs
          label="Disbursement status"
          value={tab}
          onChange={(v) => {
            const nextTab = v as DisbursementTab;
            setTab(nextTab);
            setPage(1);
            updateUrl({ tab: nextTab, page: 1 });
          }}
          items={[
            { value: "pending", label: "To pay", count: pendingBatches.length, icon: "bank" },
            { value: "paid", label: "Paid", count: paidBatches.length, icon: "done" },
            { value: "all", label: "All", count: batches.length, icon: "list" },
          ]}
        />

        <BkTools
          find="Search batches"
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
            updateUrl({ q, page: 1 });
          }}
          count={totalRows}
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

        <BkScroll>
          <Worksheet
            label="disbursement-batches"
            rows={pageRows}
            rowKey={(b) => b.id}
            columns={columns}
            totals={totals}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (b) => b.code,
            }}
            empty={
              <BkEmpty>No batches here.</BkEmpty>
            }
          />
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={(p) => {
            setPage(p);
            updateUrl({ page: p });
          }}
        />

        <BkSelectionBar count={selection.selected.size} onClear={selection.clear}>
          <Button icon="export" onClick={handleExportCsv}>
            Export
          </Button>
        </BkSelectionBar>
      </BkPage>

      {/* CREATE BATCH DRAWER */}
      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="New batch"
        sub="From an approved payroll run"
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
        <DrawerSection title="Payroll run">
          <Field label="Approved payroll run" htmlFor="batch-run">
            <Select id="batch-run" value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)}>
              <option value="">Choose</option>
              {approvedRuns.length === 0 ? (
                <option disabled>No approved runs waiting</option>
              ) : (
                approvedRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run {r.runNumber}, {r.period?.periodKey ?? "no period"}, {money(r.netTotal, "USD")}
                  </option>
                ))
              )}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="batch-notes" optional>
            <Input
              id="batch-notes"
                            value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
            />
          </Field>
        </DrawerSection>
      </Drawer>

      {/* DUAL-CUSTODIAN SIGN-OFF DRAWER */}
      <Drawer
        open={Boolean(signOffBatchId)}
        onOpenChange={(open) => !open && setSignOffBatchId(null)}
        title="Sign off the cash payout"
        sub="Two people confirm before the money goes out"
        width={540}
        footer={
          <>
            <Button onClick={() => setSignOffBatchId(null)}>Cancel</Button>
            <Button
              variant="primary"
              icon="check"
              busy={markPaidMutation.isPending}
              disabled={!custodianName.trim() || !cashVerified || !batchDetails}
              onClick={() => {
                if (!signOffBatchId || !batchDetails) return;
                const itemsPayload = batchDetails.items.map((item) => ({
                  id: item.id,
                  paidAmount: item.amount,
                  receiptReference: handoverRef.trim() || undefined,
                  notes: signOffNotes.trim() || undefined,
                }));
                markPaidMutation.mutate({
                  id: signOffBatchId,
                  cashCustodian: custodianName.trim(),
                  items: itemsPayload,
                });
              }}
            >
              Mark paid
            </Button>
          </>
        }
      >
        {signOffTargetBatch ? (
          <>
            <DrawerSection title="Batch">
              <DrawerRow label="Code">{signOffTargetBatch.code}</DrawerRow>
              <DrawerRow label="Recipients">{signOffTargetBatch.itemCount}</DrawerRow>
              <DrawerRow label="Total">
                <Amt value={signOffTargetBatch.totalAmount} currency="USD" />
              </DrawerRow>
            </DrawerSection>

            <DrawerSection title="Witness">
              <Field label="Cash custodian" htmlFor="custodian-name">
                <Input id="custodian-name" value={custodianName} onChange={(e) => setCustodianName(e.target.value)} />
              </Field>
              <Field label="Handover voucher" htmlFor="handover-ref" optional>
                <Input id="handover-ref" value={handoverRef} onChange={(e) => setHandoverRef(e.target.value)} />
              </Field>
              <Field label="Notes" htmlFor="signoff-notes" optional>
                <Input id="signoff-notes" value={signOffNotes} onChange={(e) => setSignOffNotes(e.target.value)} />
              </Field>
              <Check
                checked={cashVerified}
                onCheckedChange={setCashVerified}
                label={`The ${money(signOffTargetBatch.totalAmount, "USD")} was counted with the custodian and paid out.`}
              />
            </DrawerSection>
          </>
        ) : (
          <BooksLoading rows={4} />
        )}
      </Drawer>

      {/* BATCH LINE ITEMS INSPECTION DRAWER */}
      <Drawer
        open={Boolean(detailsBatchId)}
        onOpenChange={(open) => !open && setDetailsBatchId(null)}
        title={batchDetails ? `Batch ${batchDetails.code}` : "Batch"}
        sub={
          batchDetails
            ? `${batchDetails.itemCount} recipients, ${money(batchDetails.totalAmount, "USD")}`
            : undefined
        }
        width={640}
        footer={<Button onClick={() => setDetailsBatchId(null)}>Close</Button>}
      >
        {detailsLoading ? (
          <BooksLoading rows={4} />
        ) : batchDetails ? (
          <>
            {batchDetails.cashCustodian ? (
              <DrawerSection title="Signed off">
                <DrawerRow label="Custodian">{batchDetails.cashCustodian}</DrawerRow>
                {batchDetails.cashIssuedAt ? <DrawerRow label="Paid">{format(new Date(batchDetails.cashIssuedAt), "d MMM yyyy, HH:mm")}</DrawerRow> : null}
              </DrawerSection>
            ) : null}
            <DrawerSection title="Recipients">
              {batchDetails.items.map((item) => (
                <DrawerRow key={item.id} label={`${item.employee.name} ${item.employee.employeeId}`}>
                  <Amt value={item.amount} currency="USD" />
                </DrawerRow>
              ))}
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </PayrollShell>
  );
}

const BATCH_STATUS: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved", PAID: "Paid", REJECTED: "Rejected" };

export default function DisbursementsPage() {
  return (
    <React.Suspense
      fallback={
        <PayrollShell activeTab="disbursements">
          <BooksLoading />
        </PayrollShell>
      }
    >
      <DisbursementsContent />
    </React.Suspense>
  );
}
