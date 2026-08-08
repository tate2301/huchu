"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PeopleShell } from "@/components/people/people-shell";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * Who is off, and what they have left.
 *
 * The balance cards come first and carry their policy note, because the number
 * on its own is not the answer to the question being asked. "12 of 22 days" does
 * not tell an employee that the unused ones expire on 31 December, and that is the
 * part that changes what they do.
 *
 * The requests table shows the **frozen** day count, not a recomputed one. A
 * request that cost 4 days when it was approved still says 4 even if a public
 * holiday was added to that week afterwards — see `working-days.ts` for why.
 */

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
        `/api/people/leave/requests?limit=50${
          statusFilter === "ALL" ? "" : `&status=${statusFilter}`
        }`,
      ),
  });

  const requests = requestsQuery.data?.data ?? [];
  const loadError = employeesQuery.error || balancesQuery.error || requestsQuery.error;

  return (
    <PeopleShell activeTab="leave" title="Leave">
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load leave</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Balances</CardTitle>
            <CardDescription>
              Derived from what was granted and what has been approved — never
              stored, so it cannot disagree with the requests below.
            </CardDescription>
          </div>
          <Select
            value={selectedId}
            onValueChange={setEmployeeId}
            disabled={employeesQuery.isPending || employees.length === 0}
          >
            {/* Not a fixed width: at tablet a 220px trigger clipped "Ada Moyo ·
                EMP-001" to "Ada Moy". It sizes to the space it has and caps on
                wide screens. */}
            <SelectTrigger
              size="sm"
              className="h-8 w-full min-w-[9rem] max-w-[16rem] sm:w-auto"
            >
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
        </CardHeader>
        <CardContent>
          {balancesQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-28 w-full" />
              ))}
            </div>
          ) : !selectedId ? (
            <p className="text-sm text-muted-foreground">
              No employees yet. Add someone to the directory and their leave
              balances appear here.
            </p>
          ) : balancesQuery.data && balancesQuery.data.balances.length > 0 ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <PersonAvatar
                  name={balancesQuery.data.employee.name}
                  size="sm"
                />
                <span className="text-sm font-medium">
                  {balancesQuery.data.employee.name}
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  {balancesQuery.data.employee.employeeId}
                </span>
                <Badge variant="outline">{balancesQuery.data.year}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {balancesQuery.data.balances.map((balance) => (
                  <div
                    key={balance.leaveTypeId}
                    className="rounded-lg border border-[var(--border-subtle)] p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{balance.name}</span>
                      {balance.isUnlimited ? (
                        <Badge variant="outline">Unlimited</Badge>
                      ) : null}
                    </div>
                    {balance.isUnlimited ? (
                      <p className="mt-2 text-2xl font-bold font-mono">
                        {balance.taken}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          taken
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-2xl font-bold font-mono">
                          {balance.remaining}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">
                            / {balance.entitled} days
                          </span>
                        </p>
                        <Progress
                          value={balancePercent(balance)}
                          className="mt-2"
                        />
                        <p className="mt-2 text-xs text-muted-foreground font-mono">
                          {balance.taken} taken
                          {Number(balance.pending) > 0
                            ? ` · ${balance.pending} pending`
                            : ""}
                        </p>
                      </>
                    )}
                    {balance.policyNote ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {balance.policyNote}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No leave types are in force. Seed or add one to start tracking
              balances.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Requests</CardTitle>
            <CardDescription>
              The day count was frozen when the request was made, so adding a
              public holiday later cannot restate leave already taken.
            </CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="h-8 w-[170px]">
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
        </CardHeader>
        <CardContent>
          {requestsQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {statusFilter === "ALL"
                ? "Nobody has asked for leave yet."
                : "No requests with that status."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Cover</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PersonAvatar name={row.employee.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {row.employee.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground font-mono">
                            {row.employee.employeeId}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{row.leaveType.name}</span>
                      {!row.leaveType.isPaid ? (
                        <Badge variant="outline" className="ml-2">
                          Unpaid
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatRange(row.startDate, row.endDate)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.workingDays}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.coveringEmployee?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          STATUS_TONE[row.status] as
                            | "default"
                            | "secondary"
                            | "destructive"
                            | "outline"
                        }
                      >
                        {row.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PeopleShell>
  );
}
