"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { ArrowRight, FileText, Plus, Wrench } from "@/lib/icons"
import { HrShell } from "@/components/human-resources/hr-shell"
import { PayrollModeSwitch } from "@/components/human-resources/payroll/payroll-mode-switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { NumericCell } from "@/components/ui/numeric-cell"
import { VerticalDataViews } from "@/components/ui/vertical-data-views"
import {
  fetchPayrollConfig,
  type PayrollPeriodRecord,
  fetchPayrollPeriods,
  fetchPayrollRuns,
  updatePayrollConfig,
  type PayrollRunRecord,
} from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

type GoldSettingsForm = {
  goldPayoutCycle: "MONTHLY" | "FORTNIGHTLY"
  goldSettlementMode: "CURRENT_PERIOD" | "NEXT_PERIOD"
  autoGenerateGoldPayoutPeriods: "true" | "false"
  periodGenerationHorizon: string
}

type ManualPeriodForm = {
  monthKey: string
  cycle: "MONTHLY" | "FORTNIGHTLY"
  half: "H1" | "H2"
  dueDate: string
  notes: string
}

type RunDetails = {
  id: string
  runNumber: number
  status: string
  netTotal: number
  goldRatePerUnit?: number | null
  goldRateUnit: string
  lineItems: Array<{
    id: string
    employee: { id: string; employeeId: string; name: string }
    baseAmount: number
    variableAmount: number
    allowancesTotal: number
    deductionsTotal: number
    netAmount: number
  }>
}

type RunDetailLine = RunDetails["lineItems"][number]

const defaultManualPeriodForm: ManualPeriodForm = {
  monthKey: format(new Date(), "yyyy-MM"),
  cycle: "FORTNIGHTLY",
  half: "H1",
  dueDate: format(new Date(), "yyyy-MM-dd"),
  notes: "",
}

function mapGoldSettings(config: Awaited<ReturnType<typeof fetchPayrollConfig>>): GoldSettingsForm {
  return {
    goldPayoutCycle: config.goldPayoutCycle,
    goldSettlementMode: config.goldSettlementMode,
    autoGenerateGoldPayoutPeriods: String(config.autoGenerateGoldPayoutPeriods) as "true" | "false",
    periodGenerationHorizon: String(config.periodGenerationHorizon),
  }
}

export default function GoldPayrollPage() {
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState("")
  const [goldRatePerUnit, setGoldRatePerUnit] = useState("0")
  const [goldRateUnit, setGoldRateUnit] = useState("g")
  const [generateRunOpen, setGenerateRunOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [manualPeriodOpen, setManualPeriodOpen] = useState(false)
  const [settingsOverrides, setSettingsOverrides] = useState<Partial<GoldSettingsForm>>({})
  const [manualPeriodForm, setManualPeriodForm] = useState<ManualPeriodForm>(defaultManualPeriodForm)
  const [runDetailsId, setRunDetailsId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<"periods" | "pending" | "archived">("periods")
  const [periodsQuery, setPeriodsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [runsQuery, setRunsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [archivedRunsQuery, setArchivedRunsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [expandedPeriodIds, setExpandedPeriodIds] = useState<string[]>([])

  const { data: config, isLoading: configLoading, error: configError } = useQuery({
    queryKey: ["payroll-config"],
    queryFn: () => fetchPayrollConfig(),
  })
  const settingsForm = useMemo(() => {
    if (!config) return null
    return { ...mapGoldSettings(config), ...settingsOverrides }
  }, [config, settingsOverrides])

  const { data: periodsData, isLoading: periodsLoading, error: periodsError } = useQuery({
    queryKey: ["payroll-periods", "gold"],
    queryFn: () => fetchPayrollPeriods({ domain: "GOLD_PAYOUT", limit: 200 }),
  })
  const periods = useMemo(() => periodsData?.data ?? [], [periodsData])
  const activePeriodId = selectedPeriodId || periods[0]?.id || ""
  const activePeriod = periods.find((period) => period.id === activePeriodId)
  const expandedRunsQueries = useQueries({
    queries: expandedPeriodIds.map((periodId) => ({
      queryKey: ["payroll-runs", "gold", periodId],
      queryFn: () => fetchPayrollRuns({ domain: "GOLD_PAYOUT", periodId, limit: 200 }),
      staleTime: 30_000,
    })),
  })
  const expandedRunsByPeriodId = useMemo(() => {
    const rowsByPeriodId: Record<string, PayrollRunRecord[]> = {}
    expandedPeriodIds.forEach((periodId, index) => {
      rowsByPeriodId[periodId] = expandedRunsQueries[index]?.data?.data ?? []
    })
    return rowsByPeriodId
  }, [expandedPeriodIds, expandedRunsQueries])
  const expandedRunsLoadingIds = useMemo(
    () =>
      expandedPeriodIds.filter((periodId, index) => {
        const query = expandedRunsQueries[index]
        if (!query) return false
        return query.isLoading || (query.isFetching && !query.data)
      }),
    [expandedPeriodIds, expandedRunsQueries],
  )
  const expandedRunsErrorByPeriodId = useMemo(() => {
    const errors: Record<string, string | undefined> = {}
    expandedPeriodIds.forEach((periodId, index) => {
      const error = expandedRunsQueries[index]?.error
      if (error) {
        errors[periodId] = getApiErrorMessage(error)
      }
    })
    return errors
  }, [expandedPeriodIds, expandedRunsQueries])

  const { data: runsData, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ["payroll-runs", "gold", activePeriodId],
    queryFn: () => fetchPayrollRuns({ domain: "GOLD_PAYOUT", periodId: activePeriodId, limit: 200 }),
    enabled: Boolean(activePeriodId),
  })
  const runs = useMemo(() => runsData?.data ?? [], [runsData])
  const pendingRuns = useMemo(
    () => runs.filter((run) => run.status === "DRAFT" || run.status === "SUBMITTED" || run.status === "REJECTED"),
    [runs],
  )
  const archivedRuns = useMemo(
    () => runs.filter((run) => run.status === "APPROVED" || run.status === "POSTED"),
    [runs],
  )

  const { data: runDetails, isLoading: runDetailsLoading, error: runDetailsError } = useQuery({
    queryKey: ["payroll-run-details", runDetailsId],
    queryFn: () => fetchJson<RunDetails>(`/api/payroll/runs/${runDetailsId}`),
    enabled: Boolean(runDetailsId),
  })

  const seedPeriodsMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/payroll/periods/seed", {
        method: "POST",
        body: JSON.stringify({ domains: ["GOLD_PAYOUT"] }),
      }),
    onSuccess: () => {
      toast({ title: "Future periods generated", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] })
    },
    onError: (error) =>
      toast({ title: "Unable to seed periods", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: GoldSettingsForm) =>
      updatePayrollConfig({
        goldPayoutCycle: payload.goldPayoutCycle,
        goldSettlementMode: payload.goldSettlementMode,
        autoGenerateGoldPayoutPeriods: payload.autoGenerateGoldPayoutPeriods === "true",
        periodGenerationHorizon: Number(payload.periodGenerationHorizon),
      }),
    onSuccess: () => {
      toast({ title: "Gold payroll settings updated", variant: "success" })
      setSettingsOpen(false)
      setSettingsOverrides({})
      queryClient.invalidateQueries({ queryKey: ["payroll-config"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] })
    },
    onError: (error) =>
      toast({ title: "Unable to save settings", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const createManualPeriodMutation = useMutation({
    mutationFn: async (payload: ManualPeriodForm) =>
      fetchJson("/api/payroll/periods", {
        method: "POST",
        body: JSON.stringify({
          domain: "GOLD_PAYOUT",
          periodKey: payload.cycle === "FORTNIGHTLY" ? `${payload.monthKey}-${payload.half}` : payload.monthKey,
          cycle: payload.cycle,
          dueDate: payload.dueDate,
          isAutoGenerated: false,
          periodPurpose: "EDGE_CASE",
          notes: payload.notes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Manual period created", variant: "success" })
      setManualPeriodOpen(false)
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] })
    },
    onError: (error) =>
      toast({ title: "Unable to create period", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const generateRunMutation = useMutation({
    mutationFn: async (periodId: string) =>
      fetchJson(`/api/payroll/periods/${periodId}/generate-run`, {
        method: "POST",
        body: JSON.stringify({
          goldRatePerUnit: Number(goldRatePerUnit),
          goldRateUnit: goldRateUnit || "g",
        }),
      }),
    onSuccess: () => {
      toast({ title: "Gold payout run generated", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] })
    },
    onError: (error) =>
      toast({ title: "Unable to generate run", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const submitRunMutation = useMutation({
    mutationFn: async (runId: string) => fetchJson(`/api/payroll/runs/${runId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Run submitted", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
    },
    onError: (error) =>
      toast({ title: "Unable to submit run", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) => fetchJson<{ id?: string }>(`/api/payroll/runs/${runId}/approve`, { method: "POST" }),
    onSuccess: (run: { id?: string }) => {
      toast({ title: "Run approved", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] })
      if (run?.id) {
        router.push(`/human-resources/disbursements?runId=${run.id}`)
      }
    },
    onError: (error) =>
      toast({ title: "Unable to approve run", description: getApiErrorMessage(error), variant: "destructive" }),
  })

  const renderPrimaryAction = useCallback(
    (run: PayrollRunRecord) => {
      if (run.status === "DRAFT") {
        return (
          <Button size="sm" onClick={() => submitRunMutation.mutate(run.id)} disabled={submitRunMutation.isPending}>
            Submit
          </Button>
        )
      }
      if (run.status === "SUBMITTED") {
        return (
          <Button size="sm" onClick={() => approveRunMutation.mutate(run.id)} disabled={approveRunMutation.isPending}>
            Approve
          </Button>
        )
      }
      if (run.status === "APPROVED") {
        return (
          <Button asChild size="sm">
            <Link href={`/human-resources/disbursements?runId=${run.id}`}>
              Disburse
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        )
      }
      return null
    },
    [approveRunMutation, submitRunMutation],
  )

  const canGenerateForPeriod = useCallback(
    (period: PayrollPeriodRecord) => period.status !== "APPROVED" && period.status !== "CLOSED",
    [],
  )

  const renderRunGroup = useCallback(
    (
      label: string,
      runRows: PayrollRunRecord[],
      emptyMessage: string,
      options?: { statusVariant?: (run: PayrollRunRecord) => "outline" | "secondary" },
    ) => (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        {runRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-hidden rounded-md border-0 shadow-[var(--surface-frame-shadow)]">
            {runRows.map((run) => (
              <div
                key={run.id}
                className="grid gap-3 px-3 py-2 text-sm md:grid-cols-[minmax(0,1.6fr)_auto_auto_minmax(0,1fr)_auto] md:items-center [&:not(:last-child)]:shadow-[inset_0_-1px_0_0_var(--color-border)]"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    <NumericCell align="left">Run #{run.runNumber}</NumericCell>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <NumericCell align="left">{format(new Date(run.createdAt), "yyyy-MM-dd HH:mm")}</NumericCell>
                  </div>
                </div>
                <div>
                  <Badge variant={options?.statusVariant?.(run) ?? "outline"}>{run.status}</Badge>
                </div>
                <div>
                  <NumericCell>{run.netTotal.toFixed(2)}</NumericCell>
                </div>
                <div className="truncate text-sm text-muted-foreground">{run.createdBy?.name ?? "-"}</div>
                <div className="flex justify-start gap-2 md:justify-end">
                  {renderPrimaryAction(run)}
                  <Button size="sm" variant="outline" onClick={() => setRunDetailsId(run.id)}>
                    <FileText className="size-4" />
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    ),
    [renderPrimaryAction],
  )

  const periodColumns = useMemo<ColumnDef<PayrollPeriodRecord>[]>(
    () => [
      {
        accessorKey: "periodKey",
        header: "Period",
        cell: ({ row }) => (
          <div className="font-medium">
            <NumericCell align="left">{row.original.periodKey}</NumericCell>
          </div>
        ),
      },
      {
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.startDate), "MMM d")} - {format(new Date(row.original.endDate), "MMM d, yyyy")}
          </NumericCell>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "APPROVED" ? "secondary" : "outline"}>{row.original.status}</Badge>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <Badge variant={row.original.isAutoGenerated ? "secondary" : "outline"}>
            {row.original.isAutoGenerated ? "Auto" : "Manual"}
          </Badge>
        ),
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setSelectedPeriodId(row.original.id)
                setGenerateRunOpen(true)
              }}
              disabled={!canGenerateForPeriod(row.original) || generateRunMutation.isPending}
            >
              {canGenerateForPeriod(row.original) ? "Generate Run" : "Locked"}
            </Button>
          </div>
        ),
      },
    ],
    [canGenerateForPeriod, generateRunMutation.isPending],
  )

  const pendingRunColumns = useMemo<ColumnDef<PayrollRunRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              <NumericCell align="left">Run #{row.original.runNumber}</NumericCell>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              <NumericCell align="left">{format(new Date(row.original.createdAt), "yyyy-MM-dd HH:mm")}</NumericCell>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={row.original.status === "APPROVED" ? "secondary" : "outline"}>{row.original.status}</Badge>,
      },
      {
        accessorKey: "netTotal",
        header: "Net Total",
        cell: ({ row }) => <NumericCell>{row.original.netTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "owner",
        header: "Owner",
        cell: ({ row }) => row.original.createdBy?.name ?? "-",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {renderPrimaryAction(row.original)}
            <Button size="sm" variant="outline" onClick={() => setRunDetailsId(row.original.id)}>
              <FileText className="size-4" />
              Details
            </Button>
          </div>
        ),
      },
    ],
    [renderPrimaryAction],
  )

  const archivedRunColumns = useMemo<ColumnDef<PayrollRunRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              <NumericCell align="left">Run #{row.original.runNumber}</NumericCell>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              <NumericCell align="left">{format(new Date(row.original.createdAt), "yyyy-MM-dd HH:mm")}</NumericCell>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={row.original.status === "POSTED" ? "secondary" : "outline"}>{row.original.status}</Badge>,
      },
      {
        accessorKey: "netTotal",
        header: "Net Total",
        cell: ({ row }) => <NumericCell>{row.original.netTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "owner",
        header: "Owner",
        cell: ({ row }) => row.original.createdBy?.name ?? "-",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.status === "APPROVED" ? (
              <Button asChild size="sm">
                <Link href={`/human-resources/disbursements?runId=${row.original.id}`}>
                  Disburse
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setRunDetailsId(row.original.id)}>
              <FileText className="size-4" />
              Details
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  const runDetailColumns = useMemo<ColumnDef<RunDetailLine>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
      },
      {
        id: "base",
        header: "Base",
        accessorFn: (row) => row.baseAmount,
        cell: ({ row }) => <NumericCell>{row.original.baseAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "variable",
        header: "Variable",
        accessorFn: (row) => row.variableAmount,
        cell: ({ row }) => <NumericCell>{row.original.variableAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "allowances",
        header: "Allowances",
        accessorFn: (row) => row.allowancesTotal,
        cell: ({ row }) => <NumericCell>{row.original.allowancesTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "deductions",
        header: "Deductions",
        accessorFn: (row) => row.deductionsTotal,
        cell: ({ row }) => <NumericCell>{row.original.deductionsTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "net",
        header: "Net",
        accessorFn: (row) => row.netAmount,
        cell: ({ row }) => <NumericCell>{row.original.netAmount.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  )

  return (
    <HrShell
      activeTab="payroll"
      title="Payroll"
      description="Gold payout payroll with guided period selection, run generation, and approvals."
    >
      {(configError || periodsError || runsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payroll workspace</AlertTitle>
          <AlertDescription>{getApiErrorMessage(configError || periodsError || runsError)}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Payroll Modes
          </h2>
          <p className="text-sm text-muted-foreground">
            Keep salary payroll and gold payout payroll separated by design.
          </p>
        </header>
        <div className="section-shell">
          <PayrollModeSwitch activeMode="gold" />
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "periods", label: "Periods", count: periods.length },
          { id: "pending", label: "Pending Runs", count: pendingRuns.length },
          { id: "archived", label: "Archived Runs", count: archivedRuns.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "periods" | "pending" | "archived")}
        railLabel="Payroll Views"
      >
        {activeView === "periods" ? (
          <section className="space-y-3">
            <header className="section-shell flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Gold Payout Periods
                </h2>
                <p className="text-sm text-muted-foreground">
                  Expand a period row to review runs, then generate a run when the period is open.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setManualPeriodOpen(true)}>
                  <Plus className="size-4" />
                  Manual Period
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                  <Wrench className="size-4" />
                  Settings
                </Button>
                <Button type="button" size="sm" onClick={() => seedPeriodsMutation.mutate()} disabled={seedPeriodsMutation.isPending}>
                  Seed Periods
                </Button>
              </div>
            </header>
            {periodsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : periods.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No gold payout periods available.</div>
            ) : (
              <DataTable
                data={periods}
                columns={periodColumns}
                queryState={periodsQuery}
                onQueryStateChange={(next) => setPeriodsQuery((prev) => ({ ...prev, ...next }))}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search periods"
                tableClassName="text-sm"
                expansion={{
                  enabled: true,
                  mode: "single",
                  getRowId: (period) => period.id,
                  expandedRowIds: expandedPeriodIds,
                  onExpandedRowIdsChange: setExpandedPeriodIds,
                  onToggle: ({ row, isExpanded }) => {
                    if (isExpanded) {
                      setSelectedPeriodId(row.id)
                    }
                  },
                  loadingRowIds: expandedRunsLoadingIds,
                  errorByRowId: expandedRunsErrorByPeriodId,
                  renderExpandedContent: ({ row, rowId, isLoading, error }) => {
                    if (error) {
                      return (
                        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <p className="text-destructive">{error}</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              queryClient.invalidateQueries({
                                queryKey: ["payroll-runs", "gold", row.id],
                              })
                            }
                          >
                            Retry
                          </Button>
                        </div>
                      )
                    }
                    if (isLoading) {
                      return <div className="px-4 py-3 text-sm text-muted-foreground">Loading runs...</div>
                    }

                    const runsForPeriod = expandedRunsByPeriodId[rowId] ?? []
                    if (runsForPeriod.length === 0) {
                      return (
                        <div className="px-4 py-3 text-sm text-muted-foreground">
                          No runs generated for period {row.periodKey}.
                        </div>
                      )
                    }

                    const pendingRows = runsForPeriod.filter(
                      (run) => run.status === "DRAFT" || run.status === "SUBMITTED" || run.status === "REJECTED",
                    )
                    const archivedRows = runsForPeriod.filter(
                      (run) => run.status === "APPROVED" || run.status === "POSTED",
                    )

                    return (
                      <div className="space-y-4 px-4 py-3">
                        {renderRunGroup(
                          "Pending Runs",
                          pendingRows,
                          "No pending runs for this period.",
                        )}
                        {renderRunGroup(
                          "Archived Runs",
                          archivedRows,
                          "No archived runs for this period.",
                          { statusVariant: (run) => (run.status === "POSTED" ? "secondary" : "outline") },
                        )}
                      </div>
                    )
                  },
                }}
              />
            )}
          </section>
        ) : null}

        {activeView === "pending" ? (
          <section className="space-y-3">
            <header className="section-shell space-y-1">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                Pending Runs
              </h2>
              <p className="text-sm text-muted-foreground">
                Draft and submitted runs waiting for completion.
              </p>
            </header>
            {!activePeriod ? (
              <div className="section-shell text-sm text-muted-foreground">Select a period to view runs.</div>
            ) : runsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : pendingRuns.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No pending runs for this period.</div>
            ) : (
              <DataTable
                data={pendingRuns}
                columns={pendingRunColumns}
                queryState={runsQuery}
                onQueryStateChange={(next) => setRunsQuery((prev) => ({ ...prev, ...next }))}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search pending runs"
                tableClassName="text-sm"
              />
            )}
          </section>
        ) : null}

        {activeView === "archived" ? (
          <section className="space-y-3">
            <header className="section-shell space-y-1">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                Archived Runs
              </h2>
              <p className="text-sm text-muted-foreground">
                Approved and posted runs retained for disbursement and audit history.
              </p>
            </header>
            {!activePeriod ? (
              <div className="section-shell text-sm text-muted-foreground">Select a period to view archived runs.</div>
            ) : runsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : archivedRuns.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No archived runs for this period yet.</div>
            ) : (
              <DataTable
                data={archivedRuns}
                columns={archivedRunColumns}
                queryState={archivedRunsQuery}
                onQueryStateChange={(next) => setArchivedRunsQuery((prev) => ({ ...prev, ...next }))}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search archived runs"
                tableClassName="text-sm"
              />
            )}
          </section>
        ) : null}
      </VerticalDataViews>

      <Dialog open={generateRunOpen} onOpenChange={setGenerateRunOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate Gold Payout Run</DialogTitle>
            <DialogDescription>
              {activePeriod
                ? `Create a draft run for period ${activePeriod.periodKey} using the current gold rate.`
                : "Select a period before generating a run."}
            </DialogDescription>
          </DialogHeader>
          {!activePeriod ? (
            <div className="text-sm text-muted-foreground">No active period selected.</div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const rate = Number(goldRatePerUnit)
                if (!Number.isFinite(rate) || rate <= 0) {
                  toast({ title: "Enter a valid gold rate", variant: "destructive" })
                  return
                }
                generateRunMutation.mutate(activePeriodId, {
                  onSuccess: () => {
                    setGenerateRunOpen(false)
                    setActiveView("pending")
                  },
                })
              }}
            >
              <div className="rounded-md border-0 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Period</div>
                <div className="font-semibold">{activePeriod.periodKey}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(activePeriod.startDate), "yyyy-MM-dd")} to {format(new Date(activePeriod.endDate), "yyyy-MM-dd")}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,140px]">
                <div>
                  <label htmlFor="gold-rate" className="mb-2 block text-sm font-semibold">Gold Rate per Unit</label>
                  <Input id="gold-rate" type="number" min="0" step="0.0001" value={goldRatePerUnit} onChange={(event) => setGoldRatePerUnit(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="gold-unit" className="mb-2 block text-sm font-semibold">Unit</label>
                  <Select value={goldRateUnit} onValueChange={setGoldRateUnit}>
                    <SelectTrigger id="gold-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setGenerateRunOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={generateRunMutation.isPending || !canGenerateForPeriod(activePeriod)}>
                  Generate Run
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>Gold Payroll Settings</SheetTitle>
            <SheetDescription>Configure recurring periods and settlement behavior.</SheetDescription>
          </SheetHeader>
          {configLoading || !settingsForm ? (
            <div className="mt-6"><Skeleton className="h-24 w-full" /></div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                saveSettingsMutation.mutate(settingsForm)
              }}
            >
              <div>
                <label className="mb-2 block text-sm font-semibold">Gold Payout Cycle</label>
                <Select value={settingsForm.goldPayoutCycle} onValueChange={(value) => setSettingsOverrides((prev) => ({ ...prev, goldPayoutCycle: value as GoldSettingsForm["goldPayoutCycle"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Settlement Mode</label>
                <Select value={settingsForm.goldSettlementMode} onValueChange={(value) => setSettingsOverrides((prev) => ({ ...prev, goldSettlementMode: value as GoldSettingsForm["goldSettlementMode"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CURRENT_PERIOD">Current period</SelectItem>
                    <SelectItem value="NEXT_PERIOD">Next period</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Auto Generate Gold Periods</label>
                <Select value={settingsForm.autoGenerateGoldPayoutPeriods} onValueChange={(value) => setSettingsOverrides((prev) => ({ ...prev, autoGenerateGoldPayoutPeriods: value as GoldSettingsForm["autoGenerateGoldPayoutPeriods"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="gold-horizon" className="mb-2 block text-sm font-semibold">Generation Horizon</label>
                <Input id="gold-horizon" type="number" min="1" max="12" value={settingsForm.periodGenerationHorizon} onChange={(event) => setSettingsOverrides((prev) => ({ ...prev, periodGenerationHorizon: event.target.value }))} />
              </div>
              <Button type="submit" className="w-full" disabled={saveSettingsMutation.isPending}>Save Settings</Button>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={manualPeriodOpen} onOpenChange={setManualPeriodOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>Create Manual Gold Period</SheetTitle>
            <SheetDescription>Use manual periods for contractor or one-off exceptions.</SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); createManualPeriodMutation.mutate(manualPeriodForm) }}>
            <div>
              <label htmlFor="gold-month" className="mb-2 block text-sm font-semibold">Month</label>
              <Input id="gold-month" type="month" value={manualPeriodForm.monthKey} onChange={(event) => setManualPeriodForm((prev) => ({ ...prev, monthKey: event.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Cycle</label>
              <Select value={manualPeriodForm.cycle} onValueChange={(value) => setManualPeriodForm((prev) => ({ ...prev, cycle: value as ManualPeriodForm["cycle"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {manualPeriodForm.cycle === "FORTNIGHTLY" ? (
              <div>
                <label className="mb-2 block text-sm font-semibold">Fortnight</label>
                <Select value={manualPeriodForm.half} onValueChange={(value) => setManualPeriodForm((prev) => ({ ...prev, half: value as ManualPeriodForm["half"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H1">H1 (1st-15th)</SelectItem>
                    <SelectItem value="H2">H2 (16th-end)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <label htmlFor="gold-due" className="mb-2 block text-sm font-semibold">Due Date</label>
              <Input id="gold-due" type="date" value={manualPeriodForm.dueDate} onChange={(event) => setManualPeriodForm((prev) => ({ ...prev, dueDate: event.target.value }))} />
            </div>
            <div>
              <label htmlFor="gold-notes" className="mb-2 block text-sm font-semibold">Notes</label>
              <Input id="gold-notes" value={manualPeriodForm.notes} onChange={(event) => setManualPeriodForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <Button type="submit" className="w-full" disabled={createManualPeriodMutation.isPending}>Create Period</Button>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(runDetailsId)} onOpenChange={(open) => { if (!open) setRunDetailsId(null) }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
            <DialogDescription>Detailed employee line amounts for this run.</DialogDescription>
          </DialogHeader>
          {runDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : runDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load details</AlertTitle>
              <AlertDescription>{getApiErrorMessage(runDetailsError)}</AlertDescription>
            </Alert>
          ) : !runDetails ? (
            <div className="text-sm text-muted-foreground">No details available.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]"><div className="text-xs text-muted-foreground">Run</div><div className="font-semibold font-mono">#{runDetails.runNumber}</div></div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]"><div className="text-xs text-muted-foreground">Status</div><div className="font-semibold">{runDetails.status}</div></div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]"><div className="text-xs text-muted-foreground">Net Total</div><div className="font-semibold font-mono">{runDetails.netTotal.toFixed(2)}</div></div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]"><div className="text-xs text-muted-foreground">Rate</div><div className="font-semibold font-mono">{runDetails.goldRatePerUnit ? `${runDetails.goldRatePerUnit.toFixed(4)} / ${runDetails.goldRateUnit}` : "-"}</div></div>
              </div>
              <div className="rounded-md border-0 shadow-[var(--surface-frame-shadow)]">
                <DataTable
                  data={runDetails.lineItems}
                  columns={runDetailColumns}
                  features={{ globalFilter: false, pagination: false, sorting: true }}
                  maxBodyHeight="45dvh"
                  tableContainerClassName="overflow-auto"
                  tableClassName="text-sm"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HrShell>
  )
}
