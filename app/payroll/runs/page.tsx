"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  const [sortKey, setSortKey] = React.useState<"period" | "dueDate">("dueDate");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

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
      toast({ title: "Payroll run generated", variant: "success" });
      setGenerateDrawerOpen(false);
      setRunNotes("");
      setTab("pending");
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (err) => {
      toast({ title: "Unable to generate run", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const submitRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson(`/api/payroll/runs/${runId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Payroll run submitted for approval", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson<{ id?: string }>(`/api/payroll/runs/${runId}/approve`, { method: "POST" }),
    onSuccess: (run) => {
      toast({ title: "Payroll run approved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      if (run?.id) {
        router.push(`/payroll/disbursements?runId=${run.id}`);
      }
    },
  });

  const seedPeriodsMutation = useMutation({
    mutationFn: async () => fetchJson("/api/payroll/periods/seed", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Future periods generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
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

  // Pagination & selection
  const activeItems = tab === "periods" ? filteredPeriods : filteredRuns;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, activeItems.length);
  const pagedItems = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );
  const itemIds = React.useMemo(() => pagedItems.map((item) => item.id), [pagedItems]);
  const selection = useSelection(itemIds);

  const selectedPeriod = periods.find((p) => p.id === (selectedPeriodForRun || activePeriodId)) || periods[0];

  const handleExportCsv = () => {
    if (tab === "periods") {
      const rows = [
        ["Period", "Cycle", "Start Date", "End Date", "Due Date", "Status", "Notes"],
        ...filteredPeriods.map((p) => [
          p.periodKey,
          p.cycle,
          p.startDate ? String(p.startDate).slice(0, 10) : "",
          p.endDate ? String(p.endDate).slice(0, 10) : "",
          p.dueDate ? String(p.dueDate).slice(0, 10) : "",
          p.status,
          p.notes || "",
        ]),
      ];
      downloadCsv(`payroll-periods-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } else {
      const rows = [
        ["Run #", "Created At", "Status", "Net Total", "Created By"],
        ...filteredRuns.map((r) => [
          String(r.runNumber),
          r.createdAt ? String(r.createdAt).slice(0, 10) : "",
          r.status,
          String(r.netTotal),
          r.createdBy?.name || "",
        ]),
      ];
      downloadCsv(`payroll-runs-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }
  };

  const totalNetSum = React.useMemo(() => {
    return filteredRuns.reduce((sum, r) => sum + r.netTotal, 0);
  }, [filteredRuns]);

  return (
    <PayrollShell
      activeTab="runs"
      title="Salary Payroll Runs"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            icon="calendar"
            busy={seedPeriodsMutation.isPending}
            onClick={() => seedPeriodsMutation.mutate()}
          >
            Generate future periods
          </Button>
          <Button
            variant="primary"
            icon="plus"
            shortcut="N"
            onClick={() => {
              if (periods.length > 0) {
                setSelectedPeriodForRun(periods[0]!.id);
              }
              setGenerateDrawerOpen(true);
            }}
          >
            New payroll run
          </Button>
        </div>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Payroll views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "periods", label: "Payroll periods", count: openPeriods.length },
                { value: "pending", label: "Pending runs", count: pendingRuns.length },
                { value: "archived", label: "Approved & Posted", count: archivedRuns.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find={tab === "periods" ? "Search periods by key or note..." : "Search runs..."}
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${activeItems.length} of ${tab === "periods" ? periods.length : runs.length}`}
              chips={
                tab === "periods" ? (
                  <BkChip
                    label="Cycle"
                    value={cycleFilter || "Any"}
                    set={Boolean(cycleFilter)}
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
              end={
                <BkQuietTools
                  onSort={() => setSortKey((k) => (k === "period" ? "dueDate" : "period"))}
                  sortLabel={sortKey === "dueDate" ? "By due date" : "By period"}
                  onExport={handleExportCsv}
                />
              }
            />

            {/* TABLE SHELL */}
            <TableShell
              label={tab === "periods" ? "Payroll periods" : "Payroll runs"}
              foot={
                <TableFoot
                  range={activeItems.length === 0 ? "None" : `${from} to ${to} of ${activeItems.length}`}
                  sums={
                    tab !== "periods"
                      ? [{ label: "Total Net Payout", value: money(totalNetSum, "USD") }]
                      : []
                  }
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < activeItems.length ? () => setPage((p) => p + 1) : undefined,
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
              {activeItems.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No records match</b>
                  <p className="muted">
                    {tab === "periods"
                      ? "Generate future periods above or create your next salary run."
                      : "No runs found in this view."}
                  </p>
                </div>
              ) : tab === "periods" ? (
                /* PERIODS TABLE */
                <table className="table" aria-label="Payroll periods">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all periods"
                      />
                      <th>Period</th>
                      <th>Cycle</th>
                      <th>Dates</th>
                      <th>Due date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as PayrollPeriodRecord[]).map((period) => {
                      const isSelected = selection.isSelected(period.id);
                      return (
                        <tr key={period.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(period.id)}
                            label={`Select ${period.periodKey}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {period.periodKey}
                            </div>
                            {period.notes ? (
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                {period.notes}
                              </div>
                            ) : null}
                          </td>
                          <td>{period.cycle === "FORTNIGHTLY" ? "Fortnightly" : "Monthly"}</td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {period.startDate ? format(new Date(period.startDate), "dd MMM") : "—"}
                            {" – "}
                            {period.endDate ? format(new Date(period.endDate), "dd MMM yyyy") : "—"}
                          </td>
                          <td className="num">
                            {period.dueDate ? format(new Date(period.dueDate), "dd MMM yyyy") : "—"}
                          </td>
                          <td>
                            <BkState
                              tone={
                                period.status === "CLOSED"
                                  ? "plain"
                                  : period.status === "PROCESSING"
                                  ? "info"
                                  : "success"
                              }
                            >
                              {period.status}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {period.status !== "CLOSED" ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedPeriodForRun(period.id);
                                  setGenerateDrawerOpen(true);
                                }}
                              >
                                Run payroll
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* RUNS TABLE */
                <table className="table" aria-label="Payroll runs">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all runs"
                      />
                      <th>Run #</th>
                      <th>Date</th>
                      <th>Created by</th>
                      <th className="num">Net Payout</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as PayrollRunRecord[]).map((run) => {
                      const isSelected = selection.isSelected(run.id);
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "details",
                          label: "View line items",
                          icon: "invoice",
                          onSelect: () => setRunDetailsId(run.id),
                        },
                        ...(run.status === "DRAFT"
                          ? [
                              {
                                key: "submit",
                                label: "Submit for approval",
                                icon: "check" as const,
                                onSelect: () => submitRunMutation.mutate(run.id),
                              },
                            ]
                          : []),
                        ...(run.status === "SUBMITTED"
                          ? [
                              {
                                key: "approve",
                                label: "Approve run",
                                icon: "check" as const,
                                onSelect: () => approveRunMutation.mutate(run.id),
                              },
                            ]
                          : []),
                        ...(run.status === "APPROVED"
                          ? [
                              {
                                key: "disburse",
                                label: "Go to disbursements",
                                icon: "card" as const,
                                onSelect: () => router.push(`/payroll/disbursements?runId=${run.id}`),
                              },
                            ]
                          : []),
                      ];

                      return (
                        <tr key={run.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(run.id)}
                            label={`Select Run #${run.runNumber}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              Run #{run.runNumber}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {run.createdAt ? format(new Date(run.createdAt), "dd MMM yyyy HH:mm") : "—"}
                          </td>
                          <td>
                            {run.createdBy?.name ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Person name={run.createdBy.name} />
                                <span>{run.createdBy.name}</span>
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(run.netTotal, "USD")}
                          </td>
                          <td>
                            <BkState
                              tone={
                                run.status === "APPROVED" || run.status === "POSTED"
                                  ? "success"
                                  : run.status === "REJECTED"
                                  ? "danger"
                                  : run.status === "SUBMITTED"
                                  ? "info"
                                  : "warning"
                              }
                            >
                              {run.status}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              {run.status === "DRAFT" ? (
                                <Button
                                  size="sm"
                                  busy={submitRunMutation.isPending}
                                  onClick={() => submitRunMutation.mutate(run.id)}
                                >
                                  Submit
                                </Button>
                              ) : run.status === "SUBMITTED" ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  busy={approveRunMutation.isPending}
                                  onClick={() => approveRunMutation.mutate(run.id)}
                                >
                                  Approve
                                </Button>
                              ) : run.status === "APPROVED" ? (
                                <Button
                                  size="sm"
                                  onClick={() => router.push(`/payroll/disbursements?runId=${run.id}`)}
                                >
                                  Disburse
                                </Button>
                              ) : null}
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
                      <span className="num">
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
                  <table className="table" style={{ width: "100%", fontSize: 13 }}>
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
                            <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                              {item.employee.employeeId}
                            </div>
                          </td>
                          <td className="num">{money(item.baseAmount, "USD")}</td>
                          <td className="num" style={{ color: "var(--color-danger)" }}>
                            −{money(item.deductionsTotal, "USD")}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(item.netAmount, "USD")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PayrollShell>
  );
}
