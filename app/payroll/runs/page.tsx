"use client";

import * as React from "react";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
  BkEmpty,
  BkFilter,
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
  DrawerRow,
  DrawerSection,
  Field,
  Input,
  Person,
  Select,
  useSelection,
} from "@/components/core";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { PreCloseChecklistDrawer } from "@/components/payroll/runs/pre-close-checklist-drawer";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchPayrollConfig,
  fetchPayrollPeriods,
  fetchPayrollRuns,
  type PayrollPeriodRecord,
  type PayrollRunRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type ViewTab = "periods" | "pending" | "archived";

const RUN_STATUS: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved", POSTED: "Posted", REJECTED: "Rejected" };
const PERIOD_STATUS: Record<string, string> = { DRAFT: "Open", SUBMITTED: "Submitted", APPROVED: "Approved", PROCESSING: "Processing", CLOSED: "Closed" };

function SalaryPayrollContent() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tab = (searchParams.get("tab") as ViewTab) || "periods";
  const search = searchParams.get("q") || "";
  const cycleFilter = searchParams.get("cycle") || null;
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 20;

  const onQuery = React.useCallback(
    (next: { tab?: string; q?: string; cycle?: string | null; page?: number }) => {
      const merged = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty =
          value === null ||
          value === undefined ||
          value === "" ||
          (key === "tab" && value === "periods") ||
          (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const setTab = (nextTab: ViewTab) => onQuery({ tab: nextTab, page: 1 });
  const setSearch = (nextQ: string) => onQuery({ q: nextQ, page: 1 });
  const setCycleFilter = (nextCycle: string | null) => onQuery({ cycle: nextCycle, page: 1 });
  const setPage = (nextPage: number) => onQuery({ page: nextPage });

  // Drawers
  const [generateDrawerOpen, setGenerateDrawerOpen] = React.useState(false);
  const [selectedPeriodForRun, setSelectedPeriodForRun] = React.useState<string>("");
  const [runNotes, setRunNotes] = React.useState("");
  const [preCloseRunId, setPreCloseRunId] = React.useState<string | null>(null);

  // Queries
  useQuery({
    queryKey: ["payroll-config"],
    queryFn: () => fetchPayrollConfig(),
  });

  const { data: periodsData } = useQuery({
    queryKey: ["payroll-periods", "salary"],
    queryFn: () => fetchPayrollPeriods({ limit: 200 }),
  });

  const periods = React.useMemo(() => periodsData?.data ?? [], [periodsData]);
  const activePeriodId = selectedPeriodForRun || periods[0]?.id || "";

  const { data: runsData } = useQuery({
    queryKey: ["payroll-runs", "salary", activePeriodId],
    queryFn: () => fetchPayrollRuns({ limit: 200 }),
  });

  const runs = React.useMemo(() => runsData?.data ?? [], [runsData]);

  // Tab counts
  const openPeriods = React.useMemo(() => periods.filter((p) => p.status !== "CLOSED"), [periods]);
  const pendingRuns = React.useMemo(
    () => runs.filter((r) => r.status === "DRAFT" || r.status === "SUBMITTED" || r.status === "REJECTED"),
    [runs]
  );
  const archivedRuns = React.useMemo(
    () => runs.filter((r) => r.status === "APPROVED" || r.status === "POSTED"),
    [runs]
  );

  // Mutations
  const generateRunMutation = useMutation({
    mutationFn: async (periodId: string) =>
      fetchJson(`/api/payroll/periods/${periodId}/generate-run`, {
        method: "POST",
        body: JSON.stringify({ notes: runNotes || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Payroll run generated" });
      setGenerateDrawerOpen(false);
      setRunNotes("");
      setTab("pending");
      void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (err) => {
      toast({ title: "Unable to generate run", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const submitRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson(`/api/payroll/runs/${runId}/submit`, { method: "POST" }),
    onSuccess: () => {
      setPreCloseRunId(null);
      toast({ title: "Payroll run submitted for approval" });
      void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson<{ id?: string }>(`/api/payroll/runs/${runId}/approve`, { method: "POST" }),
    onSuccess: (run) => {
      toast({ title: "Payroll run approved" });
      void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      if (run?.id) {
        router.push(`/payroll/disbursements?runId=${run.id}`);
      }
    },
  });

  const seedPeriodsMutation = useMutation({
    mutationFn: async () => fetchJson("/api/payroll/periods/seed", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Future periods generated" });
      void queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
  });

  // Filtered lists
  const filteredPeriods = React.useMemo(() => {
    let list = [...periods];
    if (cycleFilter) {
      list = list.filter((p) => p.cycle === cycleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.periodKey.toLowerCase().includes(q) || (p.notes && p.notes.toLowerCase().includes(q)));
    }
    return list;
  }, [periods, cycleFilter, search]);

  const currentRuns = tab === "pending" ? pendingRuns : archivedRuns;
  const filteredRuns = React.useMemo(() => {
    let list = [...currentRuns];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          String(r.runNumber).includes(q) ||
          r.status.toLowerCase().includes(q) ||
          (r.createdBy?.name && r.createdBy.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [currentRuns, search]);

  // Active items and pagination
  const activeItems = tab === "periods" ? filteredPeriods : filteredRuns;
  const totalRows = activeItems.length;
  const pageRows = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const selectedPeriod = periods.find((p) => p.id === (selectedPeriodForRun || activePeriodId)) || periods[0];

  const handleExportCsv = () => {
    if (tab === "periods") {
      downloadCsv(
        `payroll-periods-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Period", "Cycle", "Start Date", "End Date", "Due Date", "Status", "Notes"],
        filteredPeriods.map((p) => [
          p.periodKey,
          p.cycle,
          p.startDate ? String(p.startDate).slice(0, 10) : "",
          p.endDate ? String(p.endDate).slice(0, 10) : "",
          p.dueDate ? String(p.dueDate).slice(0, 10) : "",
          p.status,
          p.notes || "",
        ])
      );
    } else {
      downloadCsv(
        `payroll-runs-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Run #", "Created At", "Status", "Net Total", "Created By"],
        filteredRuns.map((r) => [
          String(r.runNumber),
          r.createdAt ? String(r.createdAt).slice(0, 10) : "",
          r.status,
          String(r.netTotal),
          r.createdBy?.name || "",
        ])
      );
    }
  };

  const handleBulkApprove = async () => {
    try {
      await Promise.all(
        Array.from(selection.selected).map((id) =>
          fetchJson(`/api/payroll/runs/${id}/approve`, { method: "POST" })
        )
      );
      toast({ title: `Approved ${selection.selected.size} payroll run${selection.selected.size > 1 ? "s" : ""}` });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
  };

  const totalNetSum = React.useMemo(() => {
    return filteredRuns.reduce((sum, r) => sum + r.netTotal, 0);
  }, [filteredRuns]);

  // Columns for periods
  const periodColumns: Array<WsColumn<PayrollPeriodRecord>> = [
    {
      key: "period",
      head: "Period",
      cell: (p) => (
        <>
          {p.periodKey}
          {p.notes ? <span className="muted truncate"> {p.notes}</span> : null}
        </>
      ),
    },
    {
      key: "cycle",
      head: "Cycle",
      className: "muted",
      cell: (p) => (p.cycle === "FORTNIGHTLY" ? "Fortnightly" : "Monthly"),
    },
    {
      key: "dates",
      head: "Covers",
      className: "muted mono",
      cell: (p) => `${p.startDate ? format(new Date(p.startDate), "d MMM") : "—"} to ${p.endDate ? format(new Date(p.endDate), "d MMM yyyy") : "—"}`,
    },
    {
      key: "due",
      head: "Due",
      className: "mono",
      cell: (p) => (p.dueDate ? format(new Date(p.dueDate), "d MMM yyyy") : <None />),
    },
    {
      key: "status",
      head: "Status",
      cell: (p) => {
        const tone =
          p.status === "CLOSED"
            ? "void"
            : (p.status as string) === "PROCESSING"
            ? "info"
            : "done";
        return <St tone={tone}>{PERIOD_STATUS[p.status as string] ?? p.status}</St>;
      },
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (p) =>
        p.status !== "CLOSED" ? (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPeriodForRun(p.id);
              setGenerateDrawerOpen(true);
            }}
          >
            Run payroll
          </Button>
        ) : null,
    },
  ];

  // Columns for runs
  const runColumns: Array<WsColumn<PayrollRunRecord>> = [
    {
      key: "runNumber",
      head: "Run",
      cell: (r) => `Run ${r.runNumber}`,
    },
    {
      key: "date",
      head: "Created",
      className: "muted mono",
      cell: (r) => (r.createdAt ? format(new Date(r.createdAt), "d MMM yyyy, HH:mm") : <None />),
    },
    {
      key: "createdBy",
      head: "Prepared by",
      cell: (r) =>
        r.createdBy?.name ? (
          <Person name={r.createdBy.name} />
        ) : (
          <None />
        ),
    },
    {
      key: "netTotal",
      head: "Net pay",
      right: true,
      cell: (r) => <Amt value={r.netTotal} currency="USD" />,
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone =
          r.status === "APPROVED" || r.status === "POSTED"
            ? "done"
            : r.status === "REJECTED"
            ? "bad"
            : r.status === "SUBMITTED"
            ? "info"
            : "warn";
        return <St tone={tone}>{RUN_STATUS[r.status] ?? r.status}</St>;
      },
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (r) =>
        r.status === "DRAFT" ? (
          <Button size="sm" onClick={() => setPreCloseRunId(r.id)}>
            Submit
          </Button>
        ) : r.status === "SUBMITTED" ? (
          <Button size="sm" variant="primary" busy={approveRunMutation.isPending} onClick={() => approveRunMutation.mutate(r.id)}>
            Approve
          </Button>
        ) : r.status === "APPROVED" ? (
          <Button size="sm" onClick={() => router.push(`/payroll/disbursements?runId=${r.id}`)}>
            Pay out
          </Button>
        ) : null,
    },
  ];

  const periodTotals = [
    `${filteredPeriods.length} periods`,
    null,
    null,
    null,
    `${openPeriods.length} active`,
    null,
  ];

  const runTotals = [
    `${filteredRuns.length} runs`,
    null,
    null,
    <Amt key="net" value={totalNetSum} currency="USD" className="font-medium" />,
    `${pendingRuns.length} pending`,
    null,
  ];

  return (
    <PayrollShell
      activeTab="runs"
      title="Pay runs"
      primary={{
        label: "New run",
        icon: "plus",
        shortcut: "N",
        onClick: () => {
          if (periods.length > 0) {
            setSelectedPeriodForRun(periods[0]!.id);
          }
          setGenerateDrawerOpen(true);
        },
      }}
      actions={
        <Button
          variant="quiet"
          icon="calendar"
          busy={seedPeriodsMutation.isPending}
          onClick={() => seedPeriodsMutation.mutate()}
        >
          Add periods
        </Button>
      }
    >
      <BkPage screen="payroll-runs" scroll={false}>
        <BkFinding
          fact={
            tab === "periods"
              ? `${openPeriods.length} open ${openPeriods.length === 1 ? "period" : "periods"}.`
              : tab === "pending"
              ? `${pendingRuns.length} ${pendingRuns.length === 1 ? "run" : "runs"} to submit or approve.`
              : `${archivedRuns.length} approved or posted.`
          }
        />

        <BkTabs
          label="Payroll views"
          value={tab}
          onChange={(next) => {
            setTab(next as ViewTab);
            setPage(1);
            selection.clear();
          }}
          items={[
            { value: "periods", label: "Periods", count: openPeriods.length, icon: "calendar" },
            { value: "pending", label: "To approve", count: pendingRuns.length, icon: "clock" },
            { value: "archived", label: "Approved", count: archivedRuns.length, icon: "done" },
          ]}
        />

        <BkTools
          find={tab === "periods" ? "Search periods" : "Search runs"}
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            tab === "periods" ? (
              <BkFilter
                label="Cycle"
                value={cycleFilter ? (cycleFilter === "MONTHLY" ? "Monthly" : "Fortnightly") : "Any"}
                items={[
                  {
                    key: "any-cycle",
                    label: "Any cycle",
                    checked: !cycleFilter,
                    onSelect: () => {
                      setCycleFilter(null);
                      setPage(1);
                    },
                  },
                  { separator: true },
                  {
                    key: "monthly",
                    label: "Monthly",
                    checked: cycleFilter === "MONTHLY",
                    onSelect: () => {
                      setCycleFilter("MONTHLY");
                      setPage(1);
                    },
                  },
                  {
                    key: "fortnightly",
                    label: "Fortnightly",
                    checked: cycleFilter === "FORTNIGHTLY",
                    onSelect: () => {
                      setCycleFilter("FORTNIGHTLY");
                      setPage(1);
                    },
                  },
                ]}
              />
            ) : undefined
          }
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

        <BkScroll>
          {tab === "periods" ? (
            <Worksheet
              label="payroll periods"
              rows={pageRows as PayrollPeriodRecord[]}
              rowKey={(p) => p.id}
              columns={periodColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (p) => p.periodKey,
              }}
              totals={periodTotals}
              openHref={(p) => (p.runs?.length ? `/payroll/runs/${p.runs[0]!.id}` : null)}
              empty={<BkEmpty action={<Button onClick={() => seedPeriodsMutation.mutate()}>Add periods</Button>}>No periods yet.</BkEmpty>}
            />
          ) : (
            <Worksheet
              label="payroll runs"
              rows={pageRows as PayrollRunRecord[]}
              rowKey={(r) => r.id}
              columns={runColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (r) => `Run ${r.runNumber}`,
              }}
              totals={runTotals}
              openHref={(r) => `/payroll/runs/${r.id}`}
              empty={<BkEmpty>No runs here.</BkEmpty>}
            />
          )}
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
        >
          <Button icon="export" onClick={handleExportCsv}>
            Export
          </Button>
          {tab === "pending" ? (
            <Button icon="done" onClick={() => void handleBulkApprove()}>
              Approve
            </Button>
          ) : null}
        </BkSelectionBar>
      </BkPage>

      {/* GUIDED GENERATE RUN DRAWER */}
      <Drawer
        open={generateDrawerOpen}
        onOpenChange={setGenerateDrawerOpen}
        title="New run"
        width={480}
        footer={
          <>
            <Button onClick={() => setGenerateDrawerOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon="check"
              shortcut="Ctrl ↵"
              busy={generateRunMutation.isPending}
              onClick={() => {
                if (selectedPeriod?.id) {
                  generateRunMutation.mutate(selectedPeriod.id);
                }
              }}
            >
              Create run
            </Button>
          </>
        }
      >
        <DrawerSection title="Period">
          <Field label="Payroll period" htmlFor="run-period">
            <Select id="run-period" value={selectedPeriod?.id || ""} onChange={(e) => setSelectedPeriodForRun(e.target.value)}>
              {periods
                .filter((p) => p.status !== "CLOSED")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodKey}, due {p.dueDate ? format(new Date(p.dueDate), "d MMM yyyy") : "no date"}
                  </option>
                ))}
            </Select>
          </Field>

          {selectedPeriod ? (
            <>
              <DrawerRow label="Covers">
                {selectedPeriod.startDate ? format(new Date(selectedPeriod.startDate), "d MMM") : ""} to {selectedPeriod.endDate ? format(new Date(selectedPeriod.endDate), "d MMM yyyy") : ""}
              </DrawerRow>
              <DrawerRow label="Cycle">{selectedPeriod.cycle === "FORTNIGHTLY" ? "Fortnightly" : "Monthly"}</DrawerRow>
            </>
          ) : null}

          <Field label="Notes" htmlFor="run-notes" optional>
            <Input
              id="run-notes"
              value={runNotes}
              onChange={(e) => setRunNotes(e.target.value)}
            />
          </Field>
        </DrawerSection>
      </Drawer>

      {/* PRE-CLOSE RECONCILIATION CHECKLIST DRAWER */}
      <PreCloseChecklistDrawer
        runId={preCloseRunId}
        open={Boolean(preCloseRunId)}
        onOpenChange={(open) => !open && setPreCloseRunId(null)}
        onSubmit={(id) => submitRunMutation.mutate(id)}
        isSubmitting={submitRunMutation.isPending}
      />
    </PayrollShell>
  );
}

export default function SalaryPayrollPage() {
  return (
    <React.Suspense
      fallback={
        <PayrollShell activeTab="runs">
          <BooksLoading />
        </PayrollShell>
      }
    >
      <SalaryPayrollContent />
    </React.Suspense>
  );
}
