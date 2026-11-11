"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
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
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
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
  return start.getTime() === end.getTime() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export function LeaveContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<"requests" | "balances">("requests");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [requestDrawerOpen, setRequestDrawerOpen] = React.useState(false);
  const [reqEmployeeId, setReqEmployeeId] = React.useState("");
  const [reqLeaveTypeId, setReqLeaveTypeId] = React.useState("");
  const [reqStartDate, setReqStartDate] = React.useState("");
  const [reqEndDate, setReqEndDate] = React.useState("");
  const [reqReason, setReqReason] = React.useState("");
  const [reqCoveringId, setReqCoveringId] = React.useState("");

  // Queries
  const employeesQuery = useQuery({
    queryKey: ["people", "employees", "leave-filter"],
    queryFn: () =>
      fetchJson<{ data: EmployeeOption[] }>("/api/employees?limit=300"),
  });

  const employees = React.useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data]
  );

  React.useEffect(() => {
    if (!employeeId && employees[0]?.id) {
      setEmployeeId(employees[0].id);
    }
  }, [employees, employeeId]);

  const requestsQuery = useQuery({
    queryKey: ["people", "leave-requests", employeeId, statusFilter],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (employeeId) sp.set("employeeId", employeeId);
      if (statusFilter !== "ALL") sp.set("status", statusFilter);
      return fetchJson<{ data: LeaveRequestRow[] }>(
        `/api/people/leave/requests?${sp.toString()}`
      );
    },
  });

  const balancesQuery = useQuery({
    queryKey: ["people", "leave-balances", employeeId],
    queryFn: () =>
      fetchJson<BalancesResponse>(
        `/api/people/leave/balances?employeeId=${employeeId}`
      ),
    enabled: Boolean(employeeId),
  });

  const leaveTypesQuery = useQuery({
    queryKey: ["people", "leave-types"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string; code: string; isPaid: boolean }> }>(
        "/api/people/leave/types"
      ),
  });

  const leaveTypes = React.useMemo(
    () => leaveTypesQuery.data?.data ?? [],
    [leaveTypesQuery.data]
  );

  const requests = React.useMemo(
    () => requestsQuery.data?.data ?? [],
    [requestsQuery.data]
  );
  const balances = React.useMemo(
    () => balancesQuery.data?.balances ?? [],
    [balancesQuery.data]
  );

  // Filter requests
  const filteredRequests = React.useMemo(() => {
    return requests.filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const emp = (r.employee?.name || "").toLowerCase();
      const typ = (r.leaveType?.name || "").toLowerCase();
      const reason = (r.reason || "").toLowerCase();
      return emp.includes(q) || typ.includes(q) || reason.includes(q);
    });
  }, [requests, search]);

  const totalRows = activeTab === "requests" ? filteredRequests.length : balances.length;
  const pagedRequests = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, page, pageSize]);

  const rowIds = React.useMemo(
    () => pagedRequests.map((r) => r.id),
    [pagedRequests]
  );
  const selection = useSelection(rowIds);

  // Live days calculation
  const calculatedDays = React.useMemo(() => {
    if (!reqStartDate || !reqEndDate) return 0;
    const start = new Date(reqStartDate);
    const end = new Date(reqEndDate);
    if (end < start) return 0;
    let days = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [reqStartDate, reqEndDate]);

  // Mutations
  const createRequestMutation = useMutation({
    mutationFn: (values: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
      coveringEmployeeId?: string;
    }) =>
      fetchJson("/api/people/leave/requests", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Leave request submitted" });
      setRequestDrawerOpen(false);
      setReqReason("");
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-balances"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) =>
      fetchJson(`/api/people/leave/requests/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: (_, vars) => {
      toast({
        title: vars.decision === "APPROVE" ? "Leave request approved" : "Leave request rejected",
      });
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-balances"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const selectedRows = React.useMemo(
    () => pagedRequests.filter((r) => selection.isSelected(r.id)),
    [pagedRequests, selection]
  );

  const handleExport = () => {
    const target = selectedRows.length > 0 ? selectedRows : filteredRequests;
    downloadCsv(
      "leave-requests.csv",
      ["Employee", "Leave Type", "Start Date", "End Date", "Working Days", "Status", "Reason"],
      target.map((r) => [
        r.employee?.name || "",
        r.leaveType?.name || "",
        r.startDate,
        r.endDate,
        r.workingDays,
        r.status,
        r.reason || "",
      ])
    );
  };

  const handleBulkAction = async (decision: "APPROVE" | "REJECT") => {
    try {
      await Promise.all(
        selectedRows.map((r) =>
          fetchJson(`/api/people/leave/requests/${r.id}/decision`, {
            method: "POST",
            body: JSON.stringify({ decision }),
          })
        )
      );
      toast({
        title: `${decision === "APPROVE" ? "Approved" : "Rejected"} ${selectedRows.length} leave request${selectedRows.length > 1 ? "s" : ""}`,
      });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-balances"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
  };

  const currentEmployeeName = React.useMemo(
    () => employees.find((e) => e.id === employeeId)?.name || "All Staff",
    [employees, employeeId]
  );

  const pendingCount = requests.filter((r) => r.status === "SUBMITTED").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  const requestColumns: Array<WsColumn<LeaveRequestRow>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={r.employee?.name || "Staff"} size={24} />
          <span className="who" style={{ fontWeight: 500 }}>
            {r.employee?.name || "—"}
          </span>
        </span>
      ),
    },
    {
      key: "type",
      head: "Leave type",
      cell: (r) => (
        <span>
          {r.leaveType?.name || "Leave"}{" "}
          {r.leaveType?.isPaid ? (
            <span style={{ fontSize: 11, color: "var(--color-success)" }}>• Paid</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--color-muted)" }}>• Unpaid</span>
          )}
        </span>
      ),
    },
    {
      key: "dates",
      head: "Dates",
      className: "muted",
      cell: (r) => formatRange(r.startDate, r.endDate),
    },
    {
      key: "days",
      head: "Working days",
      right: true,
      className: "mono",
      cell: (r) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
          {parseFloat(r.workingDays) || 0}d
        </span>
      ),
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone =
          r.status === "APPROVED"
            ? "done"
            : r.status === "SUBMITTED"
            ? "warn"
            : r.status === "REJECTED"
            ? "bad"
            : "void";
        return <St tone={tone}>{r.status}</St>;
      },
    },
    {
      key: "reason",
      head: "Reason / Note",
      className: "muted",
      cell: (r) => r.reason || <None />,
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (r) =>
        r.status === "SUBMITTED" ? (
          <div style={{ display: "inline-flex", gap: 6 }}>
            <Button
              variant="default"
              size="sm"
              busy={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ id: r.id, decision: "APPROVE" })}
            >
              Approve
            </Button>
            <Button
              variant="quiet"
              size="sm"
              busy={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ id: r.id, decision: "REJECT" })}
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const balanceColumns: Array<WsColumn<LeaveBalance>> = [
    {
      key: "type",
      head: "Leave policy",
      cell: (b) => <span className="who" style={{ fontWeight: 500 }}>{b.name}</span>,
    },
    {
      key: "code",
      head: "Code",
      className: "muted mono",
      cell: (b) => b.code,
    },
    {
      key: "entitled",
      head: "Entitled",
      right: true,
      className: "mono",
      cell: (b) => (b.isUnlimited ? "Unlimited" : `${b.entitled}d`),
    },
    {
      key: "taken",
      head: "Taken",
      right: true,
      className: "mono",
      cell: (b) => `${b.taken}d`,
    },
    {
      key: "pending",
      head: "Pending",
      right: true,
      className: "mono",
      cell: (b) => (parseFloat(b.pending) > 0 ? `${b.pending}d` : <None />),
    },
    {
      key: "remaining",
      head: "Remaining balance",
      right: true,
      className: "mono",
      cell: (b) =>
        b.isUnlimited ? (
          <span style={{ color: "var(--color-success)", fontWeight: 500 }}>Unlimited</span>
        ) : (
          <span
            style={{
              fontWeight: 600,
              color: parseFloat(b.remaining) <= 0 ? "var(--color-danger)" : "var(--color-ink)",
            }}
          >
            {b.remaining}d
          </span>
        ),
    },
  ];

  return (
    <PeopleShell
      activeTab="leave"
      primary={{
        label: "Request leave",
        icon: "plus",
        shortcut: "N",
        onClick: () => {
          setReqEmployeeId(employeeId || employees[0]?.id || "");
          setRequestDrawerOpen(true);
        },
      }}
    >
      <BkPage screen="leave" scroll={false}>
        <BkFinding
          fact={`${pendingCount} pending leave applications requiring approval. ${approvedCount} approved this cycle.`}
          rest="Statutory annual, sick, and compassionate leave rules enforce working-day balance deductions."
        />

        <BkTabs
          label="Leave navigation"
          value={activeTab}
          onChange={(v) => {
            setActiveTab(v as "requests" | "balances");
            setPage(1);
          }}
          items={[
            { value: "requests", label: "Leave requests", count: requests.length, icon: "calendar" },
            { value: "balances", label: "Staff balances", count: balances.length, icon: "users" },
          ]}
        />

        <BkTools
          find={activeTab === "requests" ? "Search requests by employee, type..." : "Search staff..."}
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <>
              <BkFilter
                label="Employee"
                value={currentEmployeeName}
                items={[
                  {
                    key: "all",
                    label: "All employees",
                    checked: !employeeId,
                    onSelect: () => {
                      setEmployeeId("");
                      setPage(1);
                    },
                  },
                  { separator: true },
                  ...employees.map((e) => ({
                    key: e.id,
                    label: `${e.name} (${e.employeeId || "No ID"})`,
                    checked: employeeId === e.id,
                    onSelect: () => {
                      setEmployeeId(e.id);
                      setPage(1);
                    },
                  })),
                ]}
              />

              {activeTab === "requests" ? (
                <BkFilter
                  label="Status"
                  value={statusFilter === "ALL" ? "Any" : statusFilter}
                  items={[
                    {
                      key: "ALL",
                      label: "Any status",
                      checked: statusFilter === "ALL",
                      onSelect: () => {
                        setStatusFilter("ALL");
                        setPage(1);
                      },
                    },
                    { separator: true },
                    {
                      key: "SUBMITTED",
                      label: "Pending (Submitted)",
                      checked: statusFilter === "SUBMITTED",
                      onSelect: () => {
                        setStatusFilter("SUBMITTED");
                        setPage(1);
                      },
                    },
                    {
                      key: "APPROVED",
                      label: "Approved",
                      checked: statusFilter === "APPROVED",
                      onSelect: () => {
                        setStatusFilter("APPROVED");
                        setPage(1);
                      },
                    },
                    {
                      key: "REJECTED",
                      label: "Rejected",
                      checked: statusFilter === "REJECTED",
                      onSelect: () => {
                        setStatusFilter("REJECTED");
                        setPage(1);
                      },
                    },
                  ]}
                />
              ) : null}
            </>
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          {activeTab === "requests" ? (
            <Worksheet
              label="leave requests"
              rows={pagedRequests}
              rowKey={(r) => r.id}
              columns={requestColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (r) => `${r.employee?.name} leave`,
              }}
              empty={
                requestsQuery.isLoading ? (
                  "Loading requests..."
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 16px" }}>
                    <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                      No leave requests found.
                    </p>
                    <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                      Employees can submit time-off requests using the button above.
                    </p>
                  </div>
                )
              }
            />
          ) : (
            <Worksheet
              label="leave balances"
              rows={balances}
              rowKey={(b) => b.leaveTypeId}
              columns={balanceColumns}
              empty={
                balancesQuery.isLoading ? (
                  "Loading balances..."
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 16px" }}>
                    <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                      No balances recorded for this employee.
                    </p>
                    <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                      Balances will calculate based on statutory accrual policies and hire date.
                    </p>
                  </div>
                )
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
          <Button icon="export" onClick={handleExport}>
            Export ({selection.selected.size})
          </Button>
          {activeTab === "requests" ? (
            <>
              <Button icon="done" onClick={() => void handleBulkAction("APPROVE")}>
                Approve
              </Button>
              <Button icon="x" onClick={() => void handleBulkAction("REJECT")}>
                Reject
              </Button>
            </>
          ) : null}
        </BkSelectionBar>
      </BkPage>

      {/* Guided Drawer for requesting leave */}
      <Drawer
        open={requestDrawerOpen}
        onOpenChange={setRequestDrawerOpen}
        title="Submit Leave Request"
        sub="Select employee, leave policy type, and target date range."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <DrawerSection title="Staff Member & Leave Type">
            <Field label="Employee">
              <select
                className="select"
                value={reqEmployeeId}
                onChange={(e) => setReqEmployeeId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select staff member...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeId || "No ID"})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Leave Policy Type">
              <select
                className="select"
                value={reqLeaveTypeId}
                onChange={(e) => setReqLeaveTypeId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select policy...</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) {t.isPaid ? "• Paid" : "• Unpaid"}
                  </option>
                ))}
              </select>
            </Field>
          </DrawerSection>

          <DrawerSection title="Date Range & Working Days">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Start Date">
                <Input
                  type="date"
                  value={reqStartDate}
                  onChange={(e) => setReqStartDate(e.target.value)}
                />
              </Field>

              <Field label="End Date">
                <Input
                  type="date"
                  value={reqEndDate}
                  onChange={(e) => setReqEndDate(e.target.value)}
                />
              </Field>
            </div>

            {reqStartDate && reqEndDate ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "var(--color-fill)",
                  border: "1px solid var(--color-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--color-ink-2)" }}>
                  Calculated Working Days:
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-ink)" }}>
                  {calculatedDays} working days
                </span>
              </div>
            ) : null}
          </DrawerSection>

          <DrawerSection title="Handover & Justification">
            <Field label="Covering Colleague (Handover)">
              <select
                className="select"
                value={reqCoveringId}
                onChange={(e) => setReqCoveringId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">No covering colleague assigned</option>
                {employees
                  .filter((e) => e.id !== reqEmployeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Reason / Notes">
              <textarea
                className="textarea"
                rows={3}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Brief justification or hand-over notes..."
                style={{ width: "100%" }}
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <Button variant="quiet" onClick={() => setRequestDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createRequestMutation.isPending}
              disabled={!reqEmployeeId || !reqLeaveTypeId || !reqStartDate || !reqEndDate || !reqReason.trim()}
              onClick={() => {
                createRequestMutation.mutate({
                  employeeId: reqEmployeeId,
                  leaveTypeId: reqLeaveTypeId,
                  startDate: reqStartDate,
                  endDate: reqEndDate,
                  reason: reqReason,
                  coveringEmployeeId: reqCoveringId || undefined,
                });
              }}
            >
              Submit request
            </Button>
          </div>
        </div>
      </Drawer>
    </PeopleShell>
  );
}
