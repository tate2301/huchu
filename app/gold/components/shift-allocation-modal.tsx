"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
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
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Building2,
  FileCheck,
  Plus,
  Scale,
  Send,
  Users,
  X,
} from "@/lib/icons";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type {
  AttendanceShiftSummary,
  SearchableOption,
  ShiftExpenseInput,
} from "@/app/gold/types";

export function ShiftAllocationModal({
  open,
  onOpenChange,
  attendanceShifts,
  attendanceLoading,
  shiftReportsByKey,
  shiftReportsLoading,
  isSubmitting,
  submitError,
  onCreateAllocation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendanceShifts: AttendanceShiftSummary[];
  attendanceLoading: boolean;
  shiftReportsByKey: Map<
    string,
    { id: string; status: string; crewCount: number }
  >;
  shiftReportsLoading: boolean;
  isSubmitting: boolean;
  submitError: unknown;
  onCreateAllocation: (payload: {
    date: string;
    shift: "DAY" | "NIGHT";
    siteId: string;
    totalWeight: number;
    expenses: Array<{ type: string; weight: number }>;
    splitMode?: "DEFAULT_50_50" | "OVERRIDE_WORKER_WEIGHT";
    workerShareOverrideWeight?: number;
    splitOverrideReason?: string;
    payCycleWeeks: number;
  }) => void;
}) {
  const router = useRouter();
  const [selectedShiftKey, setSelectedShiftKey] = useState<
    string | undefined
  >();
  const [totalWeight, setTotalWeight] = useState("");
  const [expenses, setExpenses] = useState<ShiftExpenseInput[]>([
    { id: "expense-1", type: "Diesel", weight: "" },
  ]);
  const [expenseTypes, setExpenseTypes] = useState<string[]>([
    "Diesel",
    "Transport",
    "Grinding Media",
    "Security",
    "Food",
    "Supplies",
    "Other",
  ]);
  const [payCycleWeeks, setPayCycleWeeks] = useState("2");
  const [manualSplitEnabled, setManualSplitEnabled] = useState(false);
  const [workerShareOverride, setWorkerShareOverride] = useState("");
  const [splitOverrideReason, setSplitOverrideReason] = useState("");

  const resetForm = () => {
    setSelectedShiftKey(undefined);
    setTotalWeight("");
    setExpenses([{ id: "expense-1", type: "Diesel", weight: "" }]);
    setPayCycleWeeks("2");
    setManualSplitEnabled(false);
    setWorkerShareOverride("");
    setSplitOverrideReason("");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const shiftOptions = useMemo(() => {
    return attendanceShifts.map((shift) => {
      const report = shiftReportsByKey.get(shift.key);
      const reportMeta = report ? `Report: ${report.status}` : "Report missing";
      return {
        value: shift.key,
        label: `${shift.date} - ${shift.shift} - ${shift.siteName}`,
        description: `Present ${shift.presentCount} / Crew ${shift.totalCrew}`,
        meta: reportMeta,
        badgeVariant: report ? "secondary" : "destructive",
      } satisfies SearchableOption;
    });
  }, [attendanceShifts, shiftReportsByKey]);

  const selectedShift = attendanceShifts.find(
    (shift) => shift.key === selectedShiftKey,
  );
  const selectedReport = selectedShiftKey
    ? shiftReportsByKey.get(selectedShiftKey)
    : undefined;

  const expenseTypeOptions = useMemo(
    () =>
      expenseTypes.map((type) => ({
        value: type,
        label: type,
      })),
    [expenseTypes],
  );

  const totalWeightValue = Number(totalWeight || 0);
  const expenseTotal = expenses.reduce((sum, expense) => {
    const value = Number(expense.weight || 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
  const netWeight = Math.max(totalWeightValue - expenseTotal, 0);
  const workerShareOverrideValue = Number(workerShareOverride || 0);
  const workerShare = manualSplitEnabled
    ? Math.max(Math.min(workerShareOverrideValue, netWeight), 0)
    : netWeight / 2;
  const companyShare = Math.max(netWeight - workerShare, 0);
  const presentCount = selectedShift?.presentEmployees.length ?? 0;
  const perWorker = presentCount > 0 ? workerShare / presentCount : 0;
  const workerPercent = netWeight > 0 ? (workerShare / netWeight) * 100 : 0;
  const companyPercent = netWeight > 0 ? (companyShare / netWeight) * 100 : 0;

  const hasReport = !!selectedReport;
  const crewMismatch =
    !!selectedShift &&
    !!selectedReport &&
    selectedReport.crewCount !== undefined &&
    selectedShift.presentCount !== selectedReport.crewCount;
  const canSubmit =
    !!selectedShift &&
    hasReport &&
    totalWeightValue > 0 &&
    presentCount > 0 &&
    netWeight > 0 &&
    (!manualSplitEnabled ||
      (workerShare > 0 &&
        workerShare < netWeight &&
        splitOverrideReason.trim().length > 0));

  const handleAddExpense = () => {
    setExpenses((prev) => [
      ...prev,
      {
        id: `expense-${prev.length + 1}`,
        type: expenseTypes[0] ?? "Other",
        weight: "",
      },
    ]);
  };

  const handleExpenseChange = (
    id: string,
    changes: Partial<ShiftExpenseInput>,
  ) => {
    setExpenses((prev) =>
      prev.map((expense) =>
        expense.id === id ? { ...expense, ...changes } : expense,
      ),
    );
  };

  const handleRemoveExpense = (id: string) => {
    setExpenses((prev) => prev.filter((expense) => expense.id !== id));
  };

  const handleAddExpenseType = (query: string) => {
    const name = query.trim();
    if (!name) return;
    if (expenseTypes.some((type) => type.toLowerCase() === name.toLowerCase()))
      return;
    setExpenseTypes((prev) => [...prev, name]);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedShift) return;

    onCreateAllocation({
      date: selectedShift.date,
      shift: selectedShift.shift,
      siteId: selectedShift.siteId,
      totalWeight: totalWeightValue,
      expenses: expenses
        .filter((expense) => Number(expense.weight || 0) > 0)
        .map((expense) => ({
          type: expense.type,
          weight: Number(expense.weight || 0),
        })),
      splitMode: manualSplitEnabled ? "OVERRIDE_WORKER_WEIGHT" : "DEFAULT_50_50",
      workerShareOverrideWeight: manualSplitEnabled ? workerShare : undefined,
      splitOverrideReason: manualSplitEnabled
        ? splitOverrideReason.trim() || undefined
        : undefined,
      payCycleWeeks: Number(payCycleWeeks) || 2,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent size="xl" className="p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogHeader className="space-y-2">
            <DialogTitle>Record Shift Output</DialogTitle>
            <DialogDescription>
              Record shift gold, split worker/company shares, and auto-create
              the next chain records.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[80vh] overflow-y-auto px-6 py-6"
        >
          {(attendanceLoading || shiftReportsLoading) && (
            <Alert className="mb-4">
              <AlertTitle>Loading shift context</AlertTitle>
              <AlertDescription>
                Pulling attendance register and shift report records.
              </AlertDescription>
            </Alert>
          )}

          {submitError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Unable to record allocation</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(submitError)}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Attendance-Linked Shift
                </CardTitle>
                <CardDescription>
                  Select a shift from the attendance register to unlock gold
                  allocation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SearchableSelect
                  label="Shift (from attendance)"
                  value={selectedShiftKey}
                  options={shiftOptions}
                  placeholder="Search by date, shift, or site"
                  searchPlaceholder="Search shifts..."
                  onValueChange={setSelectedShiftKey}
                  onAddOption={() => {
                    handleDialogOpenChange(false);
                    router.push("/attendance");
                  }}
                  addLabel="Add attendance record"
                />

                {selectedShift ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="neutral">
                        {selectedShift.shift} - {selectedShift.date}
                      </Badge>
                      <Badge variant="secondary">
                        {selectedShift.siteName} ({selectedShift.siteCode})
                      </Badge>
                      <Badge variant="default">
                        Present {selectedShift.presentCount}
                      </Badge>
                      <Badge variant="secondary">
                        Absent {selectedShift.absentCount}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Total crew: {selectedShift.totalCrew}</span>
                      <span>Late: {selectedShift.lateCount}</span>
                      {selectedReport ? (
                        <span>
                          Shift report crew: {selectedReport.crewCount}
                        </span>
                      ) : null}
                    </div>
                    {selectedShift.presentEmployees.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground">
                          Present workers preview
                        </div>
                        <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
                          {selectedShift.presentEmployees.map((employee) => (
                            <div
                              key={employee.id}
                              className="flex items-center justify-between gap-2 rounded px-2 py-1"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <EmployeeAvatar name={employee.name} size="sm" />
                                <span className="truncate text-sm">{employee.name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {employee.employeeId}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!selectedShift && !attendanceLoading ? (
                  <Alert>
                    <AlertTitle>No attendance shifts found</AlertTitle>
                    <AlertDescription>
                      Attendance is required before recording shift gold
                      allocation.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {selectedShift && !hasReport ? (
                  <Alert variant="destructive">
                    <AlertTitle>Shift report missing</AlertTitle>
                    <AlertDescription>
                      A shift report is required before recording shift gold
                      allocation.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {selectedShift && hasReport ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileCheck className="h-4 w-4" />
                    Shift report linked: {selectedReport?.status}
                  </div>
                ) : null}

                {crewMismatch ? (
                  <Alert>
                    <AlertTitle>Crew count mismatch</AlertTitle>
                    <AlertDescription>
                      Attendance shows {selectedShift?.presentCount} present
                      while the shift report lists {selectedReport?.crewCount}.
                      Please reconcile before finalizing payout.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {selectedShift && selectedShift.presentCount === 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>No present workers</AlertTitle>
                    <AlertDescription>
                      Mark attendance before allocating gold to workers.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-muted-foreground" />
                  Gold Produced & Expenses
                </CardTitle>
                <CardDescription>
                  All values are recorded in grams.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Total weight produced (g)
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={totalWeight}
                      onChange={(event) => setTotalWeight(event.target.value)}
                      placeholder="0.000"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Pay cycle (weeks)
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={payCycleWeeks === "2" ? "default" : "outline"}
                        onClick={() => setPayCycleWeeks("2")}
                        className="flex-1"
                      >
                        2 weeks
                      </Button>
                      <Button
                        type="button"
                        variant={payCycleWeeks === "4" ? "default" : "outline"}
                        onClick={() => setPayCycleWeeks("4")}
                        className="flex-1"
                      >
                        4 weeks
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Match the worker payout cycle for this shift.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Shift expenses</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddExpense}
                    >
                      <Plus className="h-4 w-4" />
                      Add expense
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-[1.5fr_1fr_auto]"
                      >
                        <SearchableSelect
                          label="Expense type"
                          value={expense.type}
                          options={expenseTypeOptions}
                          placeholder="Select expense type"
                          searchPlaceholder="Search expense types..."
                          onValueChange={(value) =>
                            handleExpenseChange(expense.id, { type: value })
                          }
                          onAddOption={(query) => {
                            handleAddExpenseType(query);
                            if (query.trim()) {
                              handleExpenseChange(expense.id, {
                                type: query.trim(),
                              });
                            }
                          }}
                          addLabel="Add expense type"
                        />
                        <div>
                          <label className="block text-sm font-semibold mb-2">
                            Weight (g)
                          </label>
                          <Input
                            type="number"
                            step="0.001"
                            value={expense.weight}
                            onChange={(event) =>
                              handleExpenseChange(expense.id, {
                                weight: event.target.value,
                              })
                            }
                            placeholder="0.000"
                            min="0"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveExpense(expense.id)}
                            disabled={expenses.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {totalWeightValue > 0 && netWeight <= 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>Expenses exceed production</AlertTitle>
                    <AlertDescription>
                      Net gold must be positive before allocation.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-3 border-t border-border pt-4">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={manualSplitEnabled}
                      onChange={(event) => setManualSplitEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Manual split override (worker share by grams)
                  </label>
                  {manualSplitEnabled ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">
                          Worker share override (g)
                        </label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={workerShareOverride}
                          onChange={(event) =>
                            setWorkerShareOverride(event.target.value)
                          }
                          placeholder="0.000"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Must be greater than 0 and less than net gold.
                        </p>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold">
                          Override reason
                        </label>
                        <Input
                          value={splitOverrideReason}
                          onChange={(event) =>
                            setSplitOverrideReason(event.target.value)
                          }
                          placeholder="Reason for morale adjustment"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  Allocation Summary
                </CardTitle>
                <CardDescription>
                  {manualSplitEnabled
                    ? "Manual override applied for worker/company split."
                    : "Net gold is split 50/50 between workers and company."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">
                      Net gold
                    </div>
                    <div className="text-lg font-semibold">
                      {netWeight.toFixed(3)} g
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">
                      Workers ({workerPercent.toFixed(1)}%)
                    </div>
                    <div className="text-lg font-semibold">
                      {workerShare.toFixed(3)} g
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">
                      Company ({companyPercent.toFixed(1)}%)
                    </div>
                    <div className="text-lg font-semibold">
                      {companyShare.toFixed(3)} g
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Present workers</span>
                    <span className="font-semibold">{presentCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Equal share per worker</span>
                    <span className="font-semibold">
                      {perWorker.toFixed(3)} g
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="sticky bottom-0 mt-6 flex flex-col gap-3 border-t border-border bg-background py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Allocation uses attendance + shift report for validation.
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                <Send className="h-4 w-4" />
                {isSubmitting ? "Recording..." : "Save Shift Output"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
