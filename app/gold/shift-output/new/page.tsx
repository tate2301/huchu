"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSites,
  fetchShiftGroups,
  fetchShiftGroupMembers,
} from "@/lib/api";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import {
  ChevronLeftIcon,
  Send,
  Plus,
  X,
  Users,
  Scale,
  Coins,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

const STATUS_TONE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LATE: "bg-amber-100 text-amber-900 border-amber-200",
  ABSENT: "bg-rose-100 text-rose-800 border-rose-200",
};

type ExpenseRow = { id: string; type: string; weight: string };

const DEFAULT_EXPENSE_TYPES = ["Diesel", "Shoots", "LCD"];

export default function NewShiftOutputPage() {
  const router = useRouter();
  const { toast } = useToast();

  const today = new Date();
  const localDate = today.toISOString().slice(0, 10);

  const [siteId, setSiteId] = useState<string | undefined>();
  const [date, setDate] = useState(localDate);
  const [shiftName, setShiftName] = useState("MORNING");
  const [shiftGroupId, setShiftGroupId] = useState<string | undefined>();
  const [outputTonnes, setOutputTonnes] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [expenses, setExpenses] = useState<ExpenseRow[]>(
    DEFAULT_EXPENSE_TYPES.map((type, i) => ({
      id: `exp-${i}`,
      type,
      weight: "",
    })),
  );
  const [splitMode, setSplitMode] = useState<
    "DEFAULT_50_50" | "OVERRIDE_WORKER_WEIGHT"
  >("DEFAULT_50_50");
  const [workerShareOverride, setWorkerShareOverride] = useState("");
  const [splitOverrideReason, setSplitOverrideReason] = useState("");
  const [attendance, setAttendance] = useState<
    Map<string, AttendanceStatus>
  >(new Map());
  const [notes, setNotes] = useState("");

  const { data: sites } = useQuery({
    queryKey: ["sites", "shift-output"],
    queryFn: fetchSites,
  });

  // Auto-pick the only site if there's just one
  useEffect(() => {
    if (!siteId && sites && sites.length === 1) setSiteId(sites[0].id);
  }, [sites, siteId]);

  const { data: groupsData } = useQuery({
    queryKey: ["shift-groups", "shift-output", siteId],
    queryFn: () =>
      fetchShiftGroups({ active: true, limit: 100, siteId }),
    enabled: !!siteId,
  });
  const groups = groupsData?.data ?? [];

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["shift-group-members", shiftGroupId],
    queryFn: () => fetchShiftGroupMembers(shiftGroupId!, { active: true }),
    enabled: !!shiftGroupId,
  });
  const members = useMemo(
    () => membersData?.data ?? [],
    [membersData],
  );

  // Default everyone PRESENT when group changes
  useEffect(() => {
    if (members.length === 0) return;
    setAttendance((prev) => {
      const next = new Map(prev);
      let dirty = false;
      for (const m of members) {
        if (!next.has(m.employeeId)) {
          next.set(m.employeeId, "PRESENT");
          dirty = true;
        }
      }
      return dirty ? next : prev;
    });
  }, [members]);

  const presentCount = useMemo(
    () =>
      Array.from(attendance.values()).filter(
        (s) => s === "PRESENT" || s === "LATE",
      ).length,
    [attendance],
  );

  const totalWeightNum = Number(totalWeight) || 0;
  const expenseTotal = useMemo(
    () =>
      expenses.reduce((sum, exp) => {
        const v = Number(exp.weight) || 0;
        return sum + v;
      }, 0),
    [expenses],
  );
  const netWeight = Math.max(totalWeightNum - expenseTotal, 0);
  const workerShare =
    splitMode === "OVERRIDE_WORKER_WEIGHT"
      ? Math.min(Number(workerShareOverride) || 0, netWeight)
      : netWeight / 2;
  const companyShare = Math.max(netWeight - workerShare, 0);
  const perWorkerShare = presentCount > 0 ? workerShare / presentCount : 0;

  const cycleStatus = (employeeId: string) => {
    setAttendance((prev) => {
      const cur = prev.get(employeeId) ?? "PRESENT";
      const next: AttendanceStatus =
        cur === "PRESENT" ? "LATE" : cur === "LATE" ? "ABSENT" : "PRESENT";
      const map = new Map(prev);
      map.set(employeeId, next);
      return map;
    });
  };

  const setAllPresent = () => {
    const next = new Map<string, AttendanceStatus>();
    for (const m of members) next.set(m.employeeId, "PRESENT");
    setAttendance(next);
  };

  const addExpenseRow = () => {
    setExpenses((prev) => [
      ...prev,
      { id: `exp-${Date.now()}`, type: "", weight: "" },
    ]);
  };
  const removeExpenseRow = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error("Pick a site");
      if (!shiftGroupId) throw new Error("Pick a shift group");
      if (!totalWeight || totalWeightNum <= 0)
        throw new Error("Enter the gold weight");
      const cleanExpenses = expenses
        .filter((e) => e.type.trim() && Number(e.weight) > 0)
        .map((e) => ({ type: e.type.trim(), weight: Number(e.weight) }));
      const attendanceItems = Array.from(attendance.entries()).map(
        ([employeeId, status]) => ({ employeeId, status }),
      );
      return fetchJson<{
        allocationId: string;
        pourId: string | null;
        warnings: string[];
      }>("/api/gold/shift-output", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          date,
          shift: shiftName,
          shiftGroupId,
          attendance: attendanceItems,
          totalWeight: totalWeightNum,
          expenses: cleanExpenses,
          splitMode,
          workerShareOverrideWeight:
            splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? Number(workerShareOverride)
              : undefined,
          splitOverrideReason:
            splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? splitOverrideReason
              : undefined,
          outputTonnes: outputTonnes ? Number(outputTonnes) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
    },
    onSuccess: (result) => {
      toast({
        title: "Shift output saved",
        description: result.warnings.length
          ? `Saved with ${result.warnings.length} warning(s) — review on detail page.`
          : "Allocation, attendance, and pour created.",
        variant: "success",
      });
      router.push(`/gold/insights/allocations/${result.allocationId}`);
    },
  });

  return (
    <GoldShell
      activeTab="batches"
      title="Record shift output"
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/gold">
              <ChevronLeftIcon className="mr-1 h-4 w-4" /> Overview
            </Link>
          </Button>
          <Button
            size="sm"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {submit.isPending ? "Saving…" : "Save shift output"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {submit.error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(submit.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="rounded-lg border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Scale className="h-4 w-4 text-amber-600" /> 1 · Where & when
              </h2>
              <p className="text-xs text-muted-foreground">
                Site, date, and a name for this shift.
              </p>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              <SearchableSelect
                label="Site *"
                value={siteId}
                options={(sites ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                  meta: s.code,
                }))}
                placeholder="Pick site"
                searchPlaceholder="Search sites..."
                onValueChange={(v) => setSiteId(v || undefined)}
              />
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Date *
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Shift label *
                </label>
                <Input
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value.toUpperCase())}
                  placeholder="MORNING / AFTERNOON / NIGHT"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Ore tonnes <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={outputTonnes}
                  onChange={(e) => setOutputTonnes(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card">
            <header className="border-b px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" /> 2 · Crew & attendance
                </h2>
                <p className="text-xs text-muted-foreground">
                  Tap a name to cycle Present → Late → Absent. {presentCount} present out of {members.length}.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={setAllPresent}>
                Mark all present
              </Button>
            </header>
            <div className="p-4 space-y-3">
              <SearchableSelect
                label="Shift group *"
                value={shiftGroupId}
                options={groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                  meta: g.leader?.name,
                }))}
                placeholder={
                  !siteId ? "Pick a site first" : "Pick a shift group"
                }
                searchPlaceholder="Search groups..."
                disabled={!siteId}
                onValueChange={(v) => setShiftGroupId(v || undefined)}
              />

              {!shiftGroupId ? (
                <p className="text-sm text-muted-foreground">
                  Pick a group to load its members.
                </p>
              ) : membersLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This group has no active members.
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {members.map((m) => {
                    const status = attendance.get(m.employeeId) ?? "PRESENT";
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => cycleStatus(m.employeeId)}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                          )}
                        >
                          <EmployeeAvatar
                            name={m.employee?.name ?? "?"}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              {m.employee?.name ?? "—"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.employee?.employeeId}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              STATUS_TONE[status],
                            )}
                          >
                            {status}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-600" /> 3 · Gold output & expenses
              </h2>
              <p className="text-xs text-muted-foreground">
                Gross gold (g) and per-type expense weights. Add custom rows
                for anything beyond Diesel/Shoots/LCD.
              </p>
            </header>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Gross gold weight (g) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalWeight}
                  onChange={(e) => setTotalWeight(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <header className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="text-sm font-semibold">Expenses</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={addExpenseRow}
                    className="text-xs"
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add expense
                  </Button>
                </header>
                <ul className="space-y-2">
                  {expenses.map((exp) => (
                    <li
                      key={exp.id}
                      className="grid grid-cols-[1fr_120px_36px] gap-2"
                    >
                      <Input
                        value={exp.type}
                        onChange={(e) =>
                          setExpenses((prev) =>
                            prev.map((x) =>
                              x.id === exp.id ? { ...x, type: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Type (e.g. Diesel)"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={exp.weight}
                        onChange={(e) =>
                          setExpenses((prev) =>
                            prev.map((x) =>
                              x.id === exp.id ? { ...x, weight: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="grams"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeExpenseRow(exp.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Notes <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything to flag about this shift..."
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="font-semibold">Live preview</h2>
              <p className="text-xs text-muted-foreground">
                Updates as you type. Saved on submit.
              </p>
            </header>
            <dl className="px-4 py-3 text-sm space-y-2.5">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Gross gold</dt>
                <dd className="font-mono font-semibold">
                  {totalWeightNum.toFixed(2)} g
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total expenses</dt>
                <dd className="font-mono">{expenseTotal.toFixed(2)} g</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt>Net for split</dt>
                <dd className="font-mono font-semibold">
                  {netWeight.toFixed(2)} g
                </dd>
              </div>
              <div className="flex justify-between text-blue-700">
                <dt>Workers share</dt>
                <dd className="font-mono font-semibold">
                  {workerShare.toFixed(2)} g
                </dd>
              </div>
              <div className="flex justify-between text-emerald-700">
                <dt>Company share</dt>
                <dd className="font-mono font-semibold">
                  {companyShare.toFixed(2)} g
                </dd>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                <dt>Per worker ({presentCount} present)</dt>
                <dd className="font-mono">{perWorkerShare.toFixed(3)} g</dd>
              </div>
            </dl>
            <div className="border-t px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={splitMode === "OVERRIDE_WORKER_WEIGHT"}
                  onChange={(e) =>
                    setSplitMode(
                      e.target.checked
                        ? "OVERRIDE_WORKER_WEIGHT"
                        : "DEFAULT_50_50",
                    )
                  }
                />
                Override default 50/50 split
              </label>
              {splitMode === "OVERRIDE_WORKER_WEIGHT" ? (
                <div className="mt-3 space-y-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={workerShareOverride}
                    onChange={(e) => setWorkerShareOverride(e.target.value)}
                    placeholder="Worker share (g)"
                  />
                  <Input
                    value={splitOverrideReason}
                    onChange={(e) => setSplitOverrideReason(e.target.value)}
                    placeholder="Override reason"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <Alert>
            <AlertTitle className="text-sm">What happens on save</AlertTitle>
            <AlertDescription className="text-xs">
              We create a shift report (DRAFT), mark attendance for everyone
              you toggled, save the allocation with the splits + expenses,
              and auto-pour a witnessed batch. Anomalies don&apos;t block — flagged
              rows still land in the database for reconciliation later.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </GoldShell>
  );
}
