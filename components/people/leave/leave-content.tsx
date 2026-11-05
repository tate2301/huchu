"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { PeopleShell } from "@/components/people/people-shell";
import { RecordMark } from "@/components/records/record-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type LeaveBalance = {
  leaveTypeId: string;
  code: string;
  name: string;
  policyNote: string | null;
  entitled: string;
  taken: string;
  pending: string;
  remaining: string;
  isUnlimited: boolean;
};

type BalancesResponse = {
  employee: { id: string; name: string; employeeId: string };
  year: number;
  balances: LeaveBalance[];
};

type LeaveRequestRow = {
  id: string;
  startDate: string;
  endDate: string;
  workingDays: string;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED"
    | "WITHDRAWN";
  reason: string;
  decisionNote: string | null;
  employee: { id: string; employeeId: string; name: string };
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  coveringEmployee: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
};

type EmployeeOption = { id: string; name: string; employeeId: string };

const STATUS_TONE: Record<LeaveRequestRow["status"], string> = {
  DRAFT: "outline",
  SUBMITTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
  WITHDRAWN: "outline",
};

function formatRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return start.getTime() === end.getTime()
    ? fmt(start)
    : `${fmt(start)} – ${fmt(end)}`;
}

function balancePercent(balance: LeaveBalance) {
  const entitled = Number(balance.entitled);
  if (!Number.isFinite(entitled) || entitled <= 0) return 0;
  const remaining = Math.max(0, Number(balance.remaining));
  return Math.min(100, Math.round((remaining / entitled) * 100));
}

export function LeaveContent() {
  const [activeTab, setActiveTab] = useState<"requests" | "balances">("requests");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const employeesQuery = useQuery({
    queryKey: ["employees", "leave-picker"],
    queryFn: () =>
      fetchJson<{ data: EmployeeOption[] }>("/api/employees?active=true&limit=200"),
  });

  const employees = useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data],
  );
  const selectedId = employeeId || employees[0]?.id || "";

  const balancesQuery = useQuery({
    queryKey: ["leave-balances", selectedId],
    queryFn: () =>
      fetchJson<BalancesResponse>(
        `/api/people/leave/balances?employeeId=${selectedId}`,
      ),
    enabled: Boolean(selectedId),
  });

  const requestsQuery = useQuery({
    queryKey: ["leave-requests", statusFilter],
    queryFn: () =>
      fetchJson<{ data: LeaveRequestRow[] }>(
        `/api/people/leave/requests?limit=100${
          statusFilter === "ALL" ? "" : `&status=${statusFilter}`
        }`,
      ),
  });

  const requests = requestsQuery.data?.data ?? [];
  const loadError = employeesQuery.error || balancesQuery.error || requestsQuery.error;
  const balances = balancesQuery.data?.balances ?? [];

  const requestColumns = useMemo<ColumnDef<LeaveRequestRow>[]>(
    () => [
      {
        id: "employeeId",
        header: "Employee ID",
        accessorFn: (row) => row.employee.employeeId,
        cell: ({ row }) => (
          <span className="font-mono text-sm text-[var(--color-ink-2)]">
            {row.original.employee.employeeId}
          </span>
        ),
        size: 130,
        minSize: 110,
        maxSize: 160,
      },
      {
        id: "employee",
        header: "Employee",
        accessorFn: (row) => row.employee.name,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <RecordMark kind="person" name={row.original.employee.name} size="sm" />
            <span className="truncate font-medium text-[var(--color-ink)]">
              {row.original.employee.name}
            </span>
          </div>
        ),
        size: 240,
        minSize: 180,
        maxSize: 320,
      },
      {
        id: "leaveType",
        header: "Type",
        accessorFn: (row) => row.leaveType.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="text-sm">{row.original.leaveType.name}</span>
            {!row.original.leaveType.isPaid ? (
              <Badge variant="outline">Unpaid</Badge>
            ) : null}
          </div>
        ),
        size: 160,
        minSize: 140,
        maxSize: 200,
      },
      {
        id: "dates",
        header: "Dates",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-[var(--color-ink-2)]">
            {formatRange(row.original.startDate, row.original.endDate)}
          </span>
        ),
        size: 220,
        minSize: 180,
        maxSize: 260,
      },
      {
        id: "workingDays",
        header: "Days",
        accessorFn: (row) => row.workingDays,
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.workingDays}
          </span>
        ),
        size: 90,
        minSize: 80,
        maxSize: 110,
      },
      {
        id: "coveringEmployee",
        header: "Cover",
        cell: ({ row }) => (
          <span className="text-sm text-[var(--color-ink-2)]">
            {row.original.coveringEmployee?.name ?? "—"}
          </span>
        ),
        size: 160,
        minSize: 140,
        maxSize: 200,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <Badge
            variant={
              STATUS_TONE[row.original.status] as
                | "default"
                | "secondary"
                | "destructive"
                | "outline"
            }
          >
            {row.original.status.toLowerCase()}
          </Badge>
        ),
        size: 120,
        minSize: 100,
        maxSize: 140,
      },
    ],
    [],
  );

  const balanceColumns = useMemo<ColumnDef<LeaveBalance>[]>(
    () => [
      {
        id: "leaveType",
        header: "Leave Type",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[var(--color-ink)]">{row.original.name}</div>
            <div className="font-mono text-sm text-[var(--color-ink-3)]">{row.original.code}</div>
          </div>
        ),
        size: 200,
        minSize: 160,
        maxSize: 260,
      },
      {
        id: "entitled",
        header: "Entitled",
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.isUnlimited ? "Unlimited" : `${row.original.entitled} d`}
          </span>
        ),
        size: 110,
        minSize: 90,
        maxSize: 130,
      },
      {
        id: "taken",
        header: "Taken",
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.taken} d
          </span>
        ),
        size: 100,
        minSize: 80,
        maxSize: 120,
      },
      {
        id: "pending",
        header: "Pending",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-[var(--color-ink-2)]">
            {Number(row.original.pending) > 0 ? `${row.original.pending} d` : "—"}
          </span>
        ),
        size: 100,
        minSize: 80,
        maxSize: 120,
      },
      {
        id: "remaining",
        header: "Remaining",
        cell: ({ row }) => (
          row.original.isUnlimited ? (
            <Badge variant="outline">Unlimited</Badge>
          ) : (
            <div className="space-y-1.5 min-w-[140px]">
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono font-medium">{row.original.remaining} d left</span>
                <span className="text-[var(--color-ink-3)]">{balancePercent(row.original)}%</span>
              </div>
              <Progress value={balancePercent(row.original)} className="h-1.5" />
            </div>
          )
        ),
        size: 180,
        minSize: 150,
        maxSize: 240,
      },
      {
        id: "policyNote",
        header: "Policy Note",
        cell: ({ row }) => (
          <span className="text-sm text-[var(--color-ink-2)] truncate">
            {row.original.policyNote || "—"}
          </span>
        ),
        size: 260,
        minSize: 200,
        maxSize: 380,
      },
    ],
    [],
  );

  return (
    <PeopleShell activeTab="leave" title="Leave">
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load leave</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      {/* Primary Toolbar: Tabs on their own row, contextual filters on the row below */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2.5">
          <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] p-0.5">
            <Button
              size="sm"
              variant={activeTab === "requests" ? "primary" : "ghost"}
              className="h-7 text-sm font-medium"
              onClick={() => setActiveTab("requests")}
            >
              Requests
            </Button>
            <Button
              size="sm"
              variant={activeTab === "balances" ? "primary" : "ghost"}
              className="h-7 text-sm font-medium"
              onClick={() => setActiveTab("balances")}
            >
              Balances
            </Button>
          </div>

          {activeTab === "requests" ? (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="h-8 w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="SUBMITTED">Awaiting decision</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2">
              <Select
                value={selectedId}
                onValueChange={setEmployeeId}
                disabled={employeesQuery.isPending || employees.length === 0}
              >
                <SelectTrigger size="sm" className="h-8 w-[14rem]">
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} · {employee.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {balancesQuery.data ? (
                <Badge variant="outline" className="font-mono">
                  {balancesQuery.data.year}
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        {activeTab === "requests" ? (
          requestsQuery.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-ink-3)]">
              {statusFilter === "ALL"
                ? "No leave requests recorded yet."
                : "No requests found with this status."}
            </div>
          ) : (
            <DataTable
              data={requests}
              columns={requestColumns}
              features={{ sorting: true, pagination: true }}
              pagination={{ enabled: true, server: false }}
              searchPlaceholder="Search leave requests..."
            />
          )
        ) : balancesQuery.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : balances.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--color-ink-3)]">
            No active leave policies or balances found for this employee.
          </div>
        ) : (
          <DataTable
            data={balances}
            columns={balanceColumns}
            features={{ sorting: true, pagination: false }}
            pagination={{ enabled: false }}
          />
        )}
      </div>
    </PeopleShell>
  );
}
