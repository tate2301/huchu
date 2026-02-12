"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Plus, Wrench } from "@/lib/icons";
import { HrShell } from "@/components/human-resources/hr-shell";
import { PayrollModeSwitch } from "@/components/human-resources/payroll/payroll-mode-switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchPayrollConfig,
  fetchPayrollPeriods,
  fetchPayrollRuns,
  updatePayrollConfig,
  type PayrollRunRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SalarySettingsForm = {
  payrollCycle: "MONTHLY" | "FORTNIGHTLY";
  autoGeneratePayrollPeriods: "true" | "false";
  periodGenerationHorizon: string;
};

type ManualPeriodForm = {
  monthKey: string;
  cycle: "MONTHLY" | "FORTNIGHTLY";
  half: "H1" | "H2";
  dueDate: string;
  notes: string;
};

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
    components: Array<{
      id: string;
      name: string;
      type: "ALLOWANCE" | "DEDUCTION";
      calcMethod: "FIXED" | "PERCENT";
      rateOrAmount: number;
      amount: number;
    }>;
  }>;
};

const defaultManualPeriodForm: ManualPeriodForm = {
  monthKey: format(new Date(), "yyyy-MM"),
  cycle: "MONTHLY",
  half: "H1",
  dueDate: format(new Date(), "yyyy-MM-dd"),
  notes: "",
};

function mapSalarySettings(
  config: Awaited<ReturnType<typeof fetchPayrollConfig>>,
): SalarySettingsForm {
  return {
    payrollCycle: config.payrollCycle,
    autoGeneratePayrollPeriods: String(config.autoGeneratePayrollPeriods) as
      | "true"
      | "false",
    periodGenerationHorizon: String(config.periodGenerationHorizon),
  };
}

export default function SalaryPayrollPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [runNotes, setRunNotes] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualPeriodOpen, setManualPeriodOpen] = useState(false);
  const [settingsOverrides, setSettingsOverrides] = useState<
    Partial<SalarySettingsForm>
  >({});
  const [manualPeriodForm, setManualPeriodForm] = useState<ManualPeriodForm>(
    defaultManualPeriodForm,
  );
  const [runDetailsId, setRunDetailsId] = useState<string | null>(null);

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useQuery({
    queryKey: ["payroll-config"],
    queryFn: () => fetchPayrollConfig(),
  });
  const settingsForm = useMemo(() => {
    if (!config) return null;
    return { ...mapSalarySettings(config), ...settingsOverrides };
  }, [config, settingsOverrides]);

  const {
    data: periodsData,
    isLoading: periodsLoading,
    error: periodsError,
  } = useQuery({
    queryKey: ["payroll-periods", "salary"],
    queryFn: () => fetchPayrollPeriods({ domain: "PAYROLL", limit: 200 }),
  });
  const periods = useMemo(() => periodsData?.data ?? [], [periodsData]);
  const activePeriodId = selectedPeriodId || periods[0]?.id || "";
  const activePeriod = periods.find((period) => period.id === activePeriodId);

  const {
    data: runsData,
    isLoading: runsLoading,
    error: runsError,
  } = useQuery({
    queryKey: ["payroll-runs", "salary", activePeriodId],
    queryFn: () =>
      fetchPayrollRuns({
        domain: "PAYROLL",
        periodId: activePeriodId,
        limit: 200,
      }),
    enabled: Boolean(activePeriodId),
  });
  const runs = useMemo(() => runsData?.data ?? [], [runsData]);

  const {
    data: runDetails,
    isLoading: runDetailsLoading,
    error: runDetailsError,
  } = useQuery({
    queryKey: ["payroll-run-details", runDetailsId],
    queryFn: () => fetchJson<RunDetails>(`/api/payroll/runs/${runDetailsId}`),
    enabled: Boolean(runDetailsId),
  });

  const seedPeriodsMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/payroll/periods/seed", {
        method: "POST",
        body: JSON.stringify({ domains: ["PAYROLL"] }),
      }),
    onSuccess: () => {
      toast({ title: "Future periods generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to seed periods",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: SalarySettingsForm) =>
      updatePayrollConfig({
        payrollCycle: payload.payrollCycle,
        autoGeneratePayrollPeriods:
          payload.autoGeneratePayrollPeriods === "true",
        periodGenerationHorizon: Number(payload.periodGenerationHorizon),
      }),
    onSuccess: () => {
      toast({ title: "Salary payroll settings updated", variant: "success" });
      setSettingsOpen(false);
      setSettingsOverrides({});
      queryClient.invalidateQueries({ queryKey: ["payroll-config"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to save settings",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const createManualPeriodMutation = useMutation({
    mutationFn: async (payload: ManualPeriodForm) =>
      fetchJson("/api/payroll/periods", {
        method: "POST",
        body: JSON.stringify({
          domain: "PAYROLL",
          periodKey:
            payload.cycle === "FORTNIGHTLY"
              ? `${payload.monthKey}-${payload.half}`
              : payload.monthKey,
          cycle: payload.cycle,
          dueDate: payload.dueDate,
          isAutoGenerated: false,
          periodPurpose: "EDGE_CASE",
          notes: payload.notes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Manual period created", variant: "success" });
      setManualPeriodOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to create period",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const generateRunMutation = useMutation({
    mutationFn: async (periodId: string) =>
      fetchJson(`/api/payroll/periods/${periodId}/generate-run`, {
        method: "POST",
        body: JSON.stringify({
          notes: runNotes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Salary payroll run generated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to generate run",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const submitRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson(`/api/payroll/runs/${runId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Run submitted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to submit run",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      fetchJson(`/api/payroll/runs/${runId}/approve`, { method: "POST" }),
    onSuccess: (run: { id?: string }) => {
      toast({ title: "Run approved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      if (run?.id) {
        router.push(`/human-resources/disbursements?runId=${run.id}`);
      }
    },
    onError: (error) =>
      toast({
        title: "Unable to approve run",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const renderPrimaryAction = (run: PayrollRunRecord) => {
    if (run.status === "DRAFT") {
      return (
        <Button
          size="sm"
          onClick={() => submitRunMutation.mutate(run.id)}
          disabled={submitRunMutation.isPending}
        >
          Submit
        </Button>
      );
    }
    if (run.status === "SUBMITTED") {
      return (
        <Button
          size="sm"
          onClick={() => approveRunMutation.mutate(run.id)}
          disabled={approveRunMutation.isPending}
        >
          Approve
        </Button>
      );
    }
    if (run.status === "APPROVED") {
      return (
        <Button asChild size="sm">
          <Link href={`/human-resources/disbursements?runId=${run.id}`}>
            Disburse
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      );
    }
    return (
      <Button size="sm" variant="outline">
        View
      </Button>
    );
  };

  return (
    <HrShell
      activeTab="payroll"
      title="Payroll"
      description="Salary payroll with guided period selection, run generation, and approvals."
    >
      {(configError || periodsError || runsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payroll workspace</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(configError || periodsError || runsError)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payroll Modes</CardTitle>
          <CardDescription>
            Switch between salary payroll and gold payout payroll.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayrollModeSwitch activeMode="salary" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Step 1 - Choose Period</CardTitle>
              <CardDescription>
                Select one salary payroll period to work on.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setManualPeriodOpen(true)}
              >
                <Plus className="size-4" />
                Manual Period
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
              >
                <Wrench className="size-4" />
                Settings
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => seedPeriodsMutation.mutate()}
                disabled={seedPeriodsMutation.isPending}
              >
                Seed Periods
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {periodsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : periods.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No salary payroll periods available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {period.periodKey}
                      </TableCell>
                      <TableCell>
                        {format(new Date(period.startDate), "MMM d")} -{" "}
                        {format(new Date(period.endDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            period.status === "APPROVED"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {period.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            period.isAutoGenerated ? "secondary" : "outline"
                          }
                        >
                          {period.isAutoGenerated ? "Auto" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={
                            period.id === activePeriodId ? "default" : "outline"
                          }
                          onClick={() => setSelectedPeriodId(period.id)}
                        >
                          {period.id === activePeriodId ? "Selected" : "Select"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2 - Generate Draft Run</CardTitle>
          <CardDescription>
            Generate a salary run from approved compensation setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activePeriod ? (
            <div className="text-sm text-muted-foreground">
              Select a period in Step 1 to unlock this step.
            </div>
          ) : (
            <form
              className="grid gap-3 md:grid-cols-[1fr,auto]"
              onSubmit={(event) => {
                event.preventDefault();
                generateRunMutation.mutate(activePeriodId);
              }}
            >
              <div>
                <label
                  htmlFor="salary-run-notes"
                  className="mb-2 block text-sm font-semibold"
                >
                  Run Notes
                </label>
                <Input
                  id="salary-run-notes"
                  value={runNotes}
                  onChange={(event) => setRunNotes(event.target.value)}
                  placeholder="Optional note for this generated run"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={generateRunMutation.isPending}>
                  Generate Run
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3 - Submit and Approve</CardTitle>
          <CardDescription>
            Review, submit, and approve salary runs in sequence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activePeriod ? (
            <div className="text-sm text-muted-foreground">
              Select a period to unlock approvals.
            </div>
          ) : runsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No runs for this period yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Net Total</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="font-medium">Run #{run.runNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(run.createdAt), "yyyy-MM-dd HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            run.status === "APPROVED" ? "secondary" : "outline"
                          }
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.netTotal.toFixed(2)}</TableCell>
                      <TableCell>{run.createdBy?.name ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {renderPrimaryAction(run)}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRunDetailsId(run.id)}
                          >
                            <FileText className="size-4" />
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>Salary Payroll Settings</SheetTitle>
            <SheetDescription>
              Configure recurring salary periods and generation horizon.
            </SheetDescription>
          </SheetHeader>
          {configLoading || !settingsForm ? (
            <div className="mt-6">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveSettingsMutation.mutate(settingsForm);
              }}
            >
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Payroll Cycle
                </label>
                <Select
                  value={settingsForm.payrollCycle}
                  onValueChange={(value) =>
                    setSettingsOverrides((prev) => ({
                      ...prev,
                      payrollCycle: value as SalarySettingsForm["payrollCycle"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Auto Generate Payroll Periods
                </label>
                <Select
                  value={settingsForm.autoGeneratePayrollPeriods}
                  onValueChange={(value) =>
                    setSettingsOverrides((prev) => ({
                      ...prev,
                      autoGeneratePayrollPeriods:
                        value as SalarySettingsForm["autoGeneratePayrollPeriods"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="salary-horizon"
                  className="mb-2 block text-sm font-semibold"
                >
                  Generation Horizon
                </label>
                <Input
                  id="salary-horizon"
                  type="number"
                  min="1"
                  max="12"
                  value={settingsForm.periodGenerationHorizon}
                  onChange={(event) =>
                    setSettingsOverrides((prev) => ({
                      ...prev,
                      periodGenerationHorizon: event.target.value,
                    }))
                  }
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={saveSettingsMutation.isPending}
              >
                Save Settings
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={manualPeriodOpen} onOpenChange={setManualPeriodOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>Create Manual Salary Period</SheetTitle>
            <SheetDescription>
              Use manual periods for contractor or exception scenarios.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createManualPeriodMutation.mutate(manualPeriodForm);
            }}
          >
            <div>
              <label
                htmlFor="salary-month"
                className="mb-2 block text-sm font-semibold"
              >
                Month
              </label>
              <Input
                id="salary-month"
                type="month"
                value={manualPeriodForm.monthKey}
                onChange={(event) =>
                  setManualPeriodForm((prev) => ({
                    ...prev,
                    monthKey: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Cycle</label>
              <Select
                value={manualPeriodForm.cycle}
                onValueChange={(value) =>
                  setManualPeriodForm((prev) => ({
                    ...prev,
                    cycle: value as ManualPeriodForm["cycle"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {manualPeriodForm.cycle === "FORTNIGHTLY" ? (
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Fortnight
                </label>
                <Select
                  value={manualPeriodForm.half}
                  onValueChange={(value) =>
                    setManualPeriodForm((prev) => ({
                      ...prev,
                      half: value as ManualPeriodForm["half"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H1">H1 (1st-15th)</SelectItem>
                    <SelectItem value="H2">H2 (16th-end)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <label
                htmlFor="salary-due"
                className="mb-2 block text-sm font-semibold"
              >
                Due Date
              </label>
              <Input
                id="salary-due"
                type="date"
                value={manualPeriodForm.dueDate}
                onChange={(event) =>
                  setManualPeriodForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label
                htmlFor="salary-notes"
                className="mb-2 block text-sm font-semibold"
              >
                Notes
              </label>
              <Input
                id="salary-notes"
                value={manualPeriodForm.notes}
                onChange={(event) =>
                  setManualPeriodForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createManualPeriodMutation.isPending}
            >
              Create Period
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(runDetailsId)}
        onOpenChange={(open) => {
          if (!open) setRunDetailsId(null);
        }}
      >
        <DialogContent className="max-w-9xl">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
            <DialogDescription>
              Detailed salary line amounts and rule components.
            </DialogDescription>
          </DialogHeader>
          {runDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : runDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load details</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(runDetailsError)}
              </AlertDescription>
            </Alert>
          ) : !runDetails ? (
            <div className="text-sm text-muted-foreground">
              No details available.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Run</div>
                  <div className="font-semibold">#{runDetails.runNumber}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="font-semibold">{runDetails.status}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Net Total</div>
                  <div className="font-semibold">
                    {runDetails.netTotal.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="max-h-[45dvh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="bg-muted sticky top-0">
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Allow</TableHead>
                      <TableHead>Deduct</TableHead>
                      <TableHead>Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runDetails.lineItems.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="font-medium">
                            {line.employee.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {line.employee.employeeId}
                          </div>
                        </TableCell>
                        <TableCell>{line.baseAmount.toFixed(2)}</TableCell>
                        <TableCell>{line.allowancesTotal.toFixed(2)}</TableCell>
                        <TableCell>{line.deductionsTotal.toFixed(2)}</TableCell>
                        <TableCell>{line.netAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HrShell>
  );
}
