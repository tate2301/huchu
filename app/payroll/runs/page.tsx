"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchPayrollConfig,
  fetchPayrollPeriods,
  fetchPayrollRuns,
  type PayrollPeriodRecord,
  type PayrollRunRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

type ViewTab = "periods" | "pending" | "archived";

type RunDetails = {
  id: string;
  runNumber: number;
  status: string;
  netTotal: number;
  lineItems: Array<{
    id: string;
    employee: { id: string; employeeId: string; name: string };
    baseAmount: number;
    variableAmount: number;
    allowancesTotal: number;
    deductionsTotal: number;
    netAmount: number;
  }>;
};

export default function SalaryPayrollPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<ViewTab>("periods");
  const [search, setSearch] = React.useState("");
  const [cycleFilter, setCycleFilter] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // Drawers
  const [generateDrawerOpen, setGenerateDrawerOpen] = React.useState(false);
  const [selectedPeriodForRun, setSelectedPeriodForRun] = React.useState<string>("");
  const [runNotes, setRunNotes] = React.useState("");
  const [runDetailsId, setRunDetailsId] = React.useState<string | null>(null);

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

  const { data: runDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["payroll-run-details", runDetailsId],
    queryFn: () => fetchJson<RunDetails>(`/api/payroll/runs/${runDetailsId}`),
    enabled: Boolean(runDetailsId),
  });

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
        <div>
          <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
            {p.periodKey}
          </div>
          {p.notes ? (
            <div className="muted" style={{ fontSize: 11 }}>
              {p.notes}
            </div>
          ) : null}
        </div>
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
      head: "Coverage dates",
      className: "muted mono",
      cell: (p) => (
        <span>
          {p.startDate ? format(new Date(p.startDate), "dd MMM") : "—"}
          {" – "}
          {p.endDate ? format(new Date(p.endDate), "dd MMM yyyy") : "—"}
        </span>
      ),
    },
    {
      key: "due",
      head: "Due date",
      className: "mono",
      cell: (p) => (p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : <None />),
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
        return <St tone={tone}>{p.status}</St>;
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
      head: "Run #",
      cell: (r) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
          Run #{r.runNumber}
        </span>
      ),
    },
    {
      key: "date",
      head: "Created date",
      className: "muted mono",
      cell: (r) => (r.createdAt ? format(new Date(r.createdAt), "dd MMM yyyy HH:mm") : <None />),
    },
    {
      key: "createdBy",
      head: "Prepared by",
      cell: (r) =>
        r.createdBy?.name ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Person name={r.createdBy.name} size={24} />
            <span>{r.createdBy.name}</span>
          </span>
        ) : (
          <None />
        ),
    },
    {
      key: "netTotal",
      head: "Net Payout",
      right: true,
      cell: (r) => <Amt value={r.netTotal} currency="USD" className="font-medium" />,
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
        return <St tone={tone}>{r.status}</St>;
      },
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (r) => {
        const moreEntries: MenuEntry[] = [
          {
            key: "details",
            label: "Inspect line items",
            icon: "invoice",
            onSelect: () => setRunDetailsId(r.id),
          },
          ...(r.status === "DRAFT"
            ? [
                {
                  key: "submit",
                  label: "Submit for approval",
                  icon: "check" as const,
                  onSelect: () => submitRunMutation.mutate(r.id),
                },
              ]
            : []),
          ...(r.status === "SUBMITTED"
            ? [
                {
                  key: "approve",
                  label: "Approve run",
                  icon: "check" as const,
                  onSelect: () => approveRunMutation.mutate(r.id),
                },
              ]
            : []),
          ...(r.status === "APPROVED"
            ? [
                {
                  key: "disburse",
                  label: "Go to disbursements",
                  icon: "bank" as const,
                  onSelect: () => router.push(`/payroll/disbursements?runId=${r.id}`),
                },
              ]
            : []),
        ];

        return (
          <div
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            {r.status === "DRAFT" ? (
              <Button
                size="sm"
                busy={submitRunMutation.isPending}
                onClick={() => submitRunMutation.mutate(r.id)}
              >
                Submit
              </Button>
            ) : r.status === "SUBMITTED" ? (
              <Button
                size="sm"
                variant="primary"
                busy={approveRunMutation.isPending}
                onClick={() => approveRunMutation.mutate(r.id)}
              >
                Approve
              </Button>
            ) : r.status === "APPROVED" ? (
              <Button
                size="sm"
                onClick={() => router.push(`/payroll/disbursements?runId=${r.id}`)}
              >
                Disburse
              </Button>
            ) : null}
            <MenuButton label="More actions" items={moreEntries} />
          </div>
        );
      },
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
      title="Salary Payroll Runs"
      primary={{
        label: "New pay run",
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
          Generate future periods
        </Button>
      }
    >
      <BkPage screen="payroll-runs" scroll={false}>
        <BkFinding
          fact={
            tab === "periods"
              ? `${openPeriods.length} open payroll periods awaiting completion.`
              : tab === "pending"
              ? `${pendingRuns.length} pending runs requiring review or submission.`
              : `${archivedRuns.length} approved and posted payroll batches.`
          }
          rest="Select any record to view details, inspect employee line items, or advance approval stages."
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
            { value: "periods", label: "Payroll periods", count: openPeriods.length, icon: "calendar" },
            { value: "pending", label: "Pending runs", count: pendingRuns.length, icon: "clock" },
            { value: "archived", label: "Approved & Posted", count: archivedRuns.length, icon: "done" },
          ]}
        />

        <BkTools
          find={tab === "periods" ? "Search periods by key or note..." : "Search runs..."}
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
              onOpen={(p) => {
                if (p.status !== "CLOSED") {
                  setSelectedPeriodForRun(p.id);
                  setGenerateDrawerOpen(true);
                }
              }}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No payroll periods found.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Generate future periods above or create your next cycle.
                  </p>
                </div>
              }
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
                labelOf: (r) => `Run #${r.runNumber}`,
              }}
              totals={runTotals}
              onOpen={(r) => setRunDetailsId(r.id)}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No payroll runs found in this view.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Generate a new payroll run from the open periods tab.
                  </p>
                </div>
              }
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
            Export ({selection.selected.size})
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
        title="Generate payroll run"
        sub="Automatically calculate base salaries, allowances, and statutory tax deductions."
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
              Run payroll now
            </Button>
          </>
        }
      >
        <DrawerSection title="Period & Cycle">
          <Field label="Payroll period" htmlFor="run-period">
            <select
              id="run-period"
              className="select"
              value={selectedPeriod?.id || ""}
              onChange={(e) => setSelectedPeriodForRun(e.target.value)}
              style={{ width: "100%", height: 36 }}
            >
              {periods
                .filter((p) => p.status !== "CLOSED")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodKey} • Due {p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : ""}
                  </option>
                ))}
            </select>
          </Field>

          {selectedPeriod ? (
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
                <span className="muted">Coverage dates</span>
                <span className="mono">
                  {selectedPeriod.startDate ? format(new Date(selectedPeriod.startDate), "dd MMM") : ""}
                  {" – "}
                  {selectedPeriod.endDate ? format(new Date(selectedPeriod.endDate), "dd MMM yyyy") : ""}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Cycle</span>
                <span style={{ fontWeight: 500 }}>{selectedPeriod.cycle}</span>
              </div>
            </div>
          ) : null}

          <Field label="Notes / Reference" htmlFor="run-notes" optional>
            <Input
              id="run-notes"
              placeholder="e.g. March 2026 Monthly Salary Batch"
              value={runNotes}
              onChange={(e) => setRunNotes(e.target.value)}
            />
          </Field>
        </DrawerSection>
      </Drawer>

      {/* RUN LINE ITEMS DRAWER */}
      <Drawer
        open={Boolean(runDetailsId)}
        onOpenChange={(open) => !open && setRunDetailsId(null)}
        title={runDetails ? `Run #${runDetails.runNumber} Line Items` : "Run Details"}
        sub={runDetails ? `Total Net Payout: ${money(runDetails.netTotal, "USD")}` : "Loading..."}
        width={640}
        footer={
          <Button onClick={() => setRunDetailsId(null)}>Close</Button>
        }
      >
        {detailsLoading ? (
          <div style={{ padding: 24, textAlign: "center" }} className="muted">
            Loading line items...
          </div>
        ) : runDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <table className="bkt" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Base</th>
                  <th className="num">Deductions</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {runDetails.lineItems.map((item) => (
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
                      <Amt value={item.baseAmount} currency="USD" />
                    </td>
                    <td className="num" style={{ color: "var(--color-danger)" }}>
                      −{money(item.deductionsTotal, "USD")}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      <Amt value={item.netAmount} currency="USD" className="font-medium" />
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
