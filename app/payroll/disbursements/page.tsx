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
  Drawer,
  DrawerSection,
  Field,
  Input,
  Select,
  useSelection,
} from "@/components/core";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchDisbursementBatches,
  fetchPayrollRuns,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

type DisbursementTab = "pending" | "paid" | "all";

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

  const columns: Array<WsColumn<(typeof batches)[number]>> = [
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
  ];

  const totals = [
    `${totalRows} batches`,
    null,
    null,
    <Amt key="tot" value={totalSum} currency="USD" className="font-medium" />,
    `${pendingBatches.length} pending`,
  ];

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
            openHref={(b) => `/payroll/disbursements/${b.id}`}
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
