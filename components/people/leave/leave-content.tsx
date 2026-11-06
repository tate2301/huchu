"use client";

import * as React from "react";
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

const STATUS_TONE: Record<LeaveRequestRow["status"], "plain" | "warning" | "success" | "danger"> = {
  DRAFT: "plain",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "plain",
  WITHDRAWN: "plain",
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
  return start.getTime() === end.getTime() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export function LeaveContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<"requests" | "balances">("requests");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // New Request Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [newRequestEmployeeId, setNewRequestEmployeeId] = React.useState("");
  const [newRequestLeaveTypeId, setNewRequestLeaveTypeId] = React.useState("");
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [coveringEmployeeId, setCoveringEmployeeId] = React.useState("");
  const [reason, setReason] = React.useState("");

  const employeesQuery = useQuery({
    queryKey: ["employees", "leave-picker"],
    queryFn: () =>
      fetchJson<{ data: EmployeeOption[] }>("/api/employees?active=true&limit=200"),
  });

  const employees = React.useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data]);
  const selectedId = employeeId || employees[0]?.id || "";

  const balancesQuery = useQuery({
    queryKey: ["leave-balances", selectedId],
    queryFn: () =>
      fetchJson<BalancesResponse>(`/api/people/leave/balances?employeeId=${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const requestsQuery = useQuery({
    queryKey: ["leave-requests", statusFilter],
    queryFn: () =>
      fetchJson<{ data: LeaveRequestRow[] }>(
        `/api/people/leave/requests?limit=150${statusFilter === "ALL" ? "" : `&status=${statusFilter}`}`
      ),
  });

  const requests = React.useMemo(() => requestsQuery.data?.data ?? [], [requestsQuery.data]);
  const balances = React.useMemo(() => balancesQuery.data?.balances ?? [], [balancesQuery.data]);

  // Leave types for drawer
  const leaveTypes = React.useMemo(() => {
    return balances.map((b) => ({ id: b.leaveTypeId, name: b.name, remaining: b.remaining }));
  }, [balances]);

  // Working days auto-calculation preview
  const estimatedWorkingDays = React.useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  }, [startDate, endDate]);

  // Create request mutation
  const createRequestMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/people/leave/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeId: newRequestEmployeeId || selectedId,
          leaveTypeId: newRequestLeaveTypeId || balances[0]?.leaveTypeId,
          startDate,
          endDate,
          reason,
          coveringEmployeeId: coveringEmployeeId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Leave request submitted", variant: "success" });
      setDrawerOpen(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: (err) => {
      toast({ title: "Unable to submit leave request", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  // Filter requests
  const filteredRequests = React.useMemo(() => {
    let list = [...requests];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.employee.name.toLowerCase().includes(q) ||
          r.leaveType.name.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, search]);

  const activeItems = activeTab === "requests" ? filteredRequests : balances;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, activeItems.length);
  const pagedRequests = React.useMemo(
    () => filteredRequests.slice((page - 1) * pageSize, page * pageSize),
    [filteredRequests, page, pageSize]
  );

  const requestIds = React.useMemo(() => pagedRequests.map((r) => r.id), [pagedRequests]);
  const selection = useSelection(requestIds);

  const handleExportCsv = () => {
    if (activeTab === "requests") {
      const csv = [
        ["Employee ID", "Employee Name", "Leave Type", "Start Date", "End Date", "Working Days", "Status", "Reason"],
        ...filteredRequests.map((r) => [
          r.employee.employeeId,
          r.employee.name,
          r.leaveType.name,
          r.startDate.slice(0, 10),
          r.endDate.slice(0, 10),
          r.workingDays,
          r.status,
          r.reason,
        ]),
      ];
      downloadCsv(`leave-requests-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } else {
      const csv = [
        ["Policy", "Entitled", "Taken", "Pending", "Remaining"],
        ...balances.map((b) => [b.name, b.entitled, b.taken, b.pending, b.remaining]),
      ];
      downloadCsv(`leave-balances-${selectedId}.csv`, csv);
    }
  };

  const statusLabel =
    statusFilter === "ALL"
      ? "All statuses"
      : statusFilter === "SUBMITTED"
      ? "Awaiting decision"
      : statusFilter === "APPROVED"
      ? "Approved"
      : statusFilter === "REJECTED"
      ? "Rejected"
      : statusFilter;

  const selectedEmployeeName = React.useMemo(() => {
    return employees.find((e) => e.id === selectedId)?.name || "Select staff";
  }, [employees, selectedId]);

  return (
    <PeopleShell
      activeTab="leave"
      title="Staff Leave & Absences"
      actions={
        <Button
          variant="primary"
          icon="plus"
          shortcut="N"
          onClick={() => {
            setNewRequestEmployeeId(selectedId);
            if (balances[0]) setNewRequestLeaveTypeId(balances[0].leaveTypeId);
            setDrawerOpen(true);
          }}
        >
          Request leave
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Leave views"
              value={activeTab}
              onChange={(t) => {
                setActiveTab(t);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "requests", label: "Leave requests", count: requests.length },
                { value: "balances", label: "Staff balances", count: employees.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find={activeTab === "requests" ? "Search requests by name or reason..." : "Search balances..."}
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${activeItems.length} of ${activeTab === "requests" ? requests.length : balances.length}`}
              chips={
                activeTab === "requests" ? (
                  <BkChip
                    label="Status"
                    value={statusLabel}
                    set={statusFilter !== "ALL"}
                    items={[
                      {
                        key: "ALL",
                        label: "All statuses",
                        checked: statusFilter === "ALL",
                        onSelect: () => setStatusFilter("ALL"),
                      },
                      { separator: true },
                      {
                        key: "SUBMITTED",
                        label: "Awaiting decision",
                        checked: statusFilter === "SUBMITTED",
                        onSelect: () => setStatusFilter("SUBMITTED"),
                      },
                      {
                        key: "APPROVED",
                        label: "Approved",
                        checked: statusFilter === "APPROVED",
                        onSelect: () => setStatusFilter("APPROVED"),
                      },
                      {
                        key: "REJECTED",
                        label: "Rejected",
                        checked: statusFilter === "REJECTED",
                        onSelect: () => setStatusFilter("REJECTED"),
                      },
                    ]}
                  />
                ) : (
                  <BkChip
                    label="Employee"
                    value={selectedEmployeeName}
                    set={Boolean(employeeId)}
                    items={[
                      ...employees.map((e) => ({
                        key: e.id,
                        label: `${e.name} (${e.employeeId})`,
                        checked: selectedId === e.id,
                        onSelect: () => setEmployeeId(e.id),
                      })),
                    ]}
                  />
                )
              }
              end={
                <BkQuietTools
                  onExport={handleExportCsv}
                />
              }
            />

            {/* TABLE SHELL */}
            <TableShell
              label={activeTab === "requests" ? "Leave requests" : "Leave balances"}
              foot={
                <TableFoot
                  range={activeItems.length === 0 ? "None" : `${from} to ${to} of ${activeItems.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < activeItems.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={
                    activeTab === "requests"
                      ? {
                          count: selection.selected.size,
                          onClear: selection.clear,
                          actions: (
                            <Button icon="export" onClick={handleExportCsv}>
                              Export selected
                            </Button>
                          ),
                        }
                      : undefined
                  }
                />
              }
            >
              {activeItems.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No records match</b>
                  <p className="muted">
                    {activeTab === "requests"
                      ? "Submit a leave request above to register scheduled time off."
                      : "No active leave policies or balances found for this employee."}
                  </p>
                </div>
              ) : activeTab === "requests" ? (
                /* REQUESTS TABLE */
                <table className="table" aria-label="Leave requests">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 140 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all requests"
                      />
                      <th>Employee</th>
                      <th>Leave type</th>
                      <th>Dates</th>
                      <th className="num">Days</th>
                      <th>Status</th>
                      <th>Covering & Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRequests.map((req) => {
                      const isSelected = selection.isSelected(req.id);
                      return (
                        <tr key={req.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(req.id)}
                            label={`Select request for ${req.employee.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={req.employee.name} />
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                  {req.employee.name}
                                </span>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {req.employee.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{req.leaveType.name}</div>
                            <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                              {req.leaveType.code}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {formatRange(req.startDate, req.endDate)}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {req.workingDays}d
                          </td>
                          <td>
                            <BkState tone={STATUS_TONE[req.status]}>
                              {req.status === "SUBMITTED" ? "Awaiting decision" : req.status}
                            </BkState>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, color: "var(--color-ink-2)" }}>
                              {req.reason || "—"}
                            </div>
                            {req.coveringEmployee ? (
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                Covered by {req.coveringEmployee.name}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* BALANCES TABLE */
                <table className="table" aria-label="Leave balances">
                  <colgroup>
                    <col style={{ width: 240 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 140 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Leave policy</th>
                      <th className="num">Entitled</th>
                      <th className="num">Taken</th>
                      <th className="num">Pending</th>
                      <th className="num">Remaining</th>
                      <th>Policy note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.leaveTypeId}>
                        <td>
                          <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                            {b.name}
                          </div>
                          <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                            {b.code}
                          </div>
                        </td>
                        <td className="num">{b.isUnlimited ? "Unlimited" : `${b.entitled}d`}</td>
                        <td className="num muted">{b.taken}d</td>
                        <td className="num muted">{b.pending}d</td>
                        <td className="num" style={{ fontWeight: 600, color: "var(--color-success)" }}>
                          {b.isUnlimited ? "Unlimited" : `${b.remaining}d`}
                        </td>
                        <td className="muted" style={{ fontSize: 13 }}>
                          {b.policyNote || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED REQUEST LEAVE DRAWER */}
            <Drawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              title="Request leave"
              sub="Submit a scheduled leave or absence request for manager approval."
              width={500}
              footer={
                <>
                  <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={createRequestMutation.isPending}
                    onClick={() => createRequestMutation.mutate()}
                  >
                    Submit request
                  </Button>
                </>
              }
            >
              <DrawerSection title="Who & Policy">
                <Field label="Employee" htmlFor="leave-emp">
                  <select
                    id="leave-emp"
                    className="select"
                    value={newRequestEmployeeId || selectedId}
                    onChange={(e) => {
                      setNewRequestEmployeeId(e.target.value);
                      setEmployeeId(e.target.value);
                    }}
                    style={{ width: "100%", height: 36 }}
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employeeId})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Leave type" htmlFor="leave-type">
                  <select
                    id="leave-type"
                    className="select"
                    value={newRequestLeaveTypeId}
                    onChange={(e) => setNewRequestLeaveTypeId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} • {t.remaining} days remaining
                      </option>
                    ))}
                  </select>
                </Field>
              </DrawerSection>

              <DrawerSection title="Dates & Working Days Preview">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Start date" htmlFor="leave-start">
                    <Input
                      id="leave-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="End date" htmlFor="leave-end">
                    <Input
                      id="leave-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </Field>
                </div>

                {/* Working days calculation preview card */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: "var(--color-surface)",
                    boxShadow: "var(--shadow-ring)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  <span className="muted">Estimated working days (excluding weekends)</span>
                  <span className="num" style={{ fontWeight: 600, color: "var(--color-ink)", fontSize: 15 }}>
                    {estimatedWorkingDays} {estimatedWorkingDays === 1 ? "day" : "days"}
                  </span>
                </div>

                <Field label="Covering staff" htmlFor="leave-covering" optional>
                  <select
                    id="leave-covering"
                    className="select"
                    value={coveringEmployeeId}
                    onChange={(e) => setCoveringEmployeeId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    <option value="">No cover required</option>
                    {employees
                      .filter((e) => e.id !== (newRequestEmployeeId || selectedId))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.employeeId})
                        </option>
                      ))}
                  </select>
                </Field>

                <Field label="Reason / Notes" htmlFor="leave-reason" optional>
                  <Input
                    id="leave-reason"
                    placeholder="e.g. Annual leave or family appointment"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </DrawerSection>
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
