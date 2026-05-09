"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { DetailShell, DetailSection, FactGrid } from "@/components/gold/detail-shell";
import { Coins, Users, Gem, FileCheck, Wallet, Scale, Building2 } from "@/lib/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type AllocationDetail = {
  id: string;
  date: string;
  shift: string;
  totalWeight: number;
  netWeight: number;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
  workerShareValueUsd: number | null;
  companyShareValueUsd: number | null;
  perWorkerValueUsd: number | null;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  splitMode: string;
  splitOverrideReason: string | null;
  goldPriceUsdPerGram: number | null;
  payCycleWeeks: number;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  site: { id: string; name: string; code: string };
  createdBy: { id: string; name: string } | null;
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  shiftReport: {
    id: string;
    date: string;
    shift: string;
    outputTonnes: number | null;
    crewCount: number;
    groupLeader: { id: string; name: string; employeeId: string } | null;
    shiftGroup: { id: string; name: string } | null;
  } | null;
  expenses: Array<{ id: string; type: string; weight: number }>;
  workerShares: Array<{
    id: string;
    shareWeight: number;
    shareValueUsd: number | null;
    employee: { id: string; name: string; employeeId: string; passportPhotoUrl: string };
  }>;
  pours: Array<{
    id: string;
    pourBarId: string;
    grossWeight: number;
    valueUsd: number | null;
    pourDate: string;
  }>;
  employeePayments: Array<{
    id: string;
    amountUsd: number | null;
    goldWeightGrams: number | null;
    status: string;
    dueDate: string | null;
    employee: { name: string; employeeId: string; passportPhotoUrl: string };
  }>;
  attendance: Array<{
    id: string;
    status: string;
    overtime: number | null;
    notes: string | null;
    employee: {
      id: string;
      name: string;
      employeeId: string;
      passportPhotoUrl: string;
      position: string;
    };
  }>;
  accountingEvents: Array<{
    id: string;
    sourceAction: string;
    sourceType: string | null;
    sourceId: string;
    status: string;
    amount: number | null;
    netAmount: number | null;
  }>;
};

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grams = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} g`;

const statusToTone: Record<string, Parameters<typeof StatusChip>[0]["status"]> = {
  DRAFT: "pending",
  SUBMITTED: "warning",
  APPROVED: "passing",
  REJECTED: "danger",
};

export default function AllocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canEditAttendance = role === "MANAGER" || role === "SUPERADMIN";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-allocation", id],
    queryFn: () => fetchJson<AllocationDetail>(`/api/gold/shift-allocations/${id}`),
    enabled: !!id,
  });

  const attendanceMutation = useMutation({
    mutationFn: async (payload: { attendanceId: string; status: string }) =>
      fetchJson(`/api/attendance/${payload.attendanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-allocation", id] });
      toast({ title: "Attendance updated", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not update attendance",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <DetailShell
        activeTab="payouts"
        backHref="/gold/payouts"
        backLabel="Payouts"
        title="Loading…"
        primary={<Skeleton className="h-64 w-full" />}
        side={<Skeleton className="h-40 w-full" />}
      />
    );
  }

  if (error || !data) {
    return (
      <DetailShell
        activeTab="payouts"
        backHref="/gold/payouts"
        backLabel="Payouts"
        title="Could not load allocation"
        primary={
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error ? getApiErrorMessage(error) : "Not found"}</AlertDescription>
          </Alert>
        }
        side={<div />}
      />
    );
  }

  return (
    <DetailShell
      activeTab="payouts"
      backHref="/gold/payouts"
      backLabel="Payouts"
      title={`${data.shift} · ${new Date(data.date).toLocaleDateString()}`}
      subtitle={`${data.site.name} · led by ${data.shiftReport?.groupLeader?.name ?? "—"}`}
      status={
        <StatusChip
          status={statusToTone[data.workflowStatus] ?? "pending"}
          label={data.workflowStatus}
        />
      }
      primary={
        <>
          <DetailSection title="Splits" icon={Coins} tone="primary">
            <FactGrid
              items={[
                { label: "Total (gross)", value: grams(data.totalWeight) },
                { label: "Net after expenses", value: grams(data.netWeight) },
                {
                  label: "Mdara (company)",
                  value: `${grams(data.companyShareWeight)} · ${usd(data.companyShareValueUsd)}`,
                },
                {
                  label: "Boys (workers)",
                  value: `${grams(data.workerShareWeight)} · ${usd(data.workerShareValueUsd)}`,
                },
                { label: "Per worker", value: `${grams(data.perWorkerWeight)} · ${usd(data.perWorkerValueUsd)}` },
                { label: "Split mode", value: data.splitMode === "DEFAULT_50_50" ? "50/50 default" : "Override" },
                { label: "Spot $/g", value: usd(data.goldPriceUsdPerGram) },
                { label: "Pay cycle", value: `${data.payCycleWeeks} weeks` },
              ]}
            />
            {data.splitOverrideReason ? (
              <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
                <strong>Override reason:</strong> {data.splitOverrideReason}
              </p>
            ) : null}
          </DetailSection>

          <DetailSection title="Expenses" icon={Scale} count={data.expenses.length}>
            {data.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {data.expenses.map((e) => (
                  <li key={e.id} className="rounded border px-3 py-2">
                    <p className="font-medium">{e.type}</p>
                    <p className="text-xs text-muted-foreground">{grams(e.weight)}</p>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection
            title="Attendance"
            icon={Users}
            count={data.attendance.length}
            description={
              canEditAttendance
                ? "Managers can correct PRESENT / ABSENT / LATE inline. Worker shares recompute on next allocation update."
                : undefined
            }
          >
            {data.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance recorded.</p>
            ) : (
              <ul className="divide-y">
                {data.attendance.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <EmployeeAvatar
                      name={a.employee.name}
                      photoUrl={a.employee.passportPhotoUrl}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.employee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.employee.employeeId} · {a.employee.position}
                      </p>
                    </div>
                    {canEditAttendance ? (
                      <Select
                        value={a.status}
                        disabled={attendanceMutation.isPending}
                        onValueChange={(value) =>
                          attendanceMutation.mutate({
                            attendanceId: a.id,
                            status: value,
                          })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRESENT">Present</SelectItem>
                          <SelectItem value="LATE">Late</SelectItem>
                          <SelectItem value="ABSENT">Absent</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusChip
                        status={a.status === "PRESENT" ? "passing" : a.status === "LATE" ? "warning" : "danger"}
                        label={a.status}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Worker shares" icon={Wallet} count={data.workerShares.length} tone="primary">
            {data.workerShares.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shares allocated.</p>
            ) : (
              <ul className="divide-y">
                {data.workerShares.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <EmployeeAvatar name={s.employee.name} photoUrl={s.employee.passportPhotoUrl} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{s.employee.name}</p>
                      <p className="text-xs text-muted-foreground">{s.employee.employeeId}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">{grams(s.shareWeight)}</p>
                      <p className="text-xs text-muted-foreground">{usd(s.shareValueUsd)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Auto-created batches" icon={Gem} count={data.pours.length} tone={data.pours.length > 0 ? "success" : "warning"}>
            {data.pours.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batch created (witnesses missing).</p>
            ) : (
              <ul className="divide-y">
                {data.pours.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/gold/intake/pours/${p.id}`} className="font-mono font-semibold hover:underline">
                        {p.pourBarId}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.pourDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">{grams(p.grossWeight)}</p>
                      <p className="text-xs text-muted-foreground">{usd(p.valueUsd)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </>
      }
      side={
        <>
          <DetailSection title="Approval chain" icon={FileCheck}>
            <ul className="space-y-3 text-sm">
              <li>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Created</p>
                <p>{data.createdBy?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{new Date(data.createdAt).toLocaleString()}</p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Submitted</p>
                <p>{data.submittedBy?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {data.submittedAt ? new Date(data.submittedAt).toLocaleString() : "Pending"}
                </p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Approved</p>
                <p>{data.approvedBy?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {data.approvedAt ? new Date(data.approvedAt).toLocaleString() : "Pending"}
                </p>
              </li>
            </ul>
          </DetailSection>

          <DetailSection title="Payouts queue" icon={Wallet} count={data.employeePayments.length}>
            {data.employeePayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments scheduled.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.employeePayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="truncate">{p.employee.name}</span>
                    <span className="text-xs text-muted-foreground">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Accounting events" icon={Building2} count={data.accountingEvents.length}>
            {data.accountingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.accountingEvents.map((e) => (
                  <li key={e.id} className="py-2">
                    <p className="font-medium">{e.sourceType ?? e.sourceAction}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.status} · {usd(e.netAmount ?? e.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </>
      }
    />
  );
}
