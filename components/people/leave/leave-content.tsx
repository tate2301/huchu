"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkEmpty,
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
import { BooksLoading } from "@/components/books/books-state";
import {
  Button,
  ButtonGroup,
  Drawer,
  DrawerRow,
  DrawerSection,
  Field,
  Input,
  Person,
  Select,
  TextArea,
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

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled", WITHDRAWN: "Withdrawn" };

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
      fetchJson<{ types: Array<{ id: string; name: string; code: string; isPaid: boolean }> }>(
        "/api/people/leave/types"
      ),
  });

  const leaveTypes = React.useMemo(
    () => leaveTypesQuery.data?.types ?? [],
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
        body: JSON.stringify({ ...values, submit: true }),
      }),
    onSuccess: () => {
      toast({ title: "Leave requested" });
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
    { key: "employee", head: "Employee", cell: (r) => (r.employee ? <Person name={r.employee.name} /> : <None />) },
    {
      key: "type",
      head: "Leave",
      cell: (r) => (
        <>
          {r.leaveType?.name || "Leave"}
          <span className="muted"> {r.leaveType?.isPaid ? "paid" : "unpaid"}</span>
        </>
      ),
    },
    { key: "dates", head: "Dates", className: "muted", cell: (r) => formatRange(r.startDate, r.endDate) },
    { key: "days", head: "Days", right: true, className: "mono", cell: (r) => parseFloat(r.workingDays) || 0 },
    {
      key: "status",
      head: "Status",
      cell: (r) => <St tone={r.status === "APPROVED" ? "done" : r.status === "SUBMITTED" ? "warn" : r.status === "REJECTED" ? "bad" : "void"}>{STATUS_LABEL[r.status] ?? r.status}</St>,
    },
    { key: "reason", head: "Reason", className: "muted", cell: (r) => r.reason || <None /> },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (r) =>
        r.status === "SUBMITTED" ? (
          <ButtonGroup>
            <Button size="sm" busy={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: r.id, decision: "APPROVE" })}>
              Approve
            </Button>
            <Button variant="quiet" size="sm" busy={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: r.id, decision: "REJECT" })}>
              Reject
            </Button>
          </ButtonGroup>
        ) : null,
    },
  ];

  const balanceColumns: Array<WsColumn<LeaveBalance>> = [
    { key: "type", head: "Leave", cell: (b) => b.name },
    { key: "code", head: "Code", className: "muted mono", cell: (b) => b.code },
    { key: "entitled", head: "Entitled", right: true, className: "mono", cell: (b) => (b.isUnlimited ? "No limit" : b.entitled) },
    { key: "taken", head: "Taken", right: true, className: "mono", cell: (b) => b.taken },
    { key: "pending", head: "Waiting", right: true, className: "mono", cell: (b) => (parseFloat(b.pending) > 0 ? b.pending : <None />) },
    { key: "remaining", head: "Left", right: true, className: "mono", cell: (b) => (b.isUnlimited ? <None /> : b.remaining) },
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
          fact={`${pendingCount} ${pendingCount === 1 ? "request" : "requests"} waiting for a decision.`}
          rest={`${approvedCount} approved.`}
        />

        <BkTabs
          label="Leave navigation"
          value={activeTab}
          onChange={(v) => {
            setActiveTab(v as "requests" | "balances");
            setPage(1);
          }}
          items={[
            { value: "requests", label: "Requests", count: requests.length, icon: "calendar" },
            { value: "balances", label: "Balances", count: balances.length, icon: "users" },
          ]}
        />

        <BkTools
          find={activeTab === "requests" ? "Search requests" : "Search balances"}
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
                    label: `${e.name} (${e.employeeId || "no ID"})`,
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
                  value={statusFilter === "ALL" ? "Any" : STATUS_LABEL[statusFilter] ?? statusFilter}
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
                      label: "Waiting",
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
                requestsQuery.isLoading ? <BooksLoading /> : <BkEmpty>No requests here.</BkEmpty>
              }
            />
          ) : (
            <Worksheet
              label="leave balances"
              rows={balances}
              rowKey={(b) => b.leaveTypeId}
              columns={balanceColumns}
              empty={
                balancesQuery.isLoading ? <BooksLoading /> : <BkEmpty>No balances for this person.</BkEmpty>
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
            Export
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

      <Drawer
        open={requestDrawerOpen}
        onOpenChange={setRequestDrawerOpen}
        title="Request leave"
        footer={
          <>
            <Button variant="quiet" onClick={() => setRequestDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createRequestMutation.isPending}
              disabled={!reqEmployeeId || !reqLeaveTypeId || !reqStartDate || !reqEndDate || !reqReason.trim()}
              onClick={() =>
                createRequestMutation.mutate({
                  employeeId: reqEmployeeId,
                  leaveTypeId: reqLeaveTypeId,
                  startDate: reqStartDate,
                  endDate: reqEndDate,
                  reason: reqReason,
                  coveringEmployeeId: reqCoveringId || undefined,
                })
              }
            >
              Request
            </Button>
          </>
        }
      >
        <DrawerSection title="Who and what">
          <Field label="Employee">
            <Select value={reqEmployeeId} onChange={(e) => setReqEmployeeId(e.target.value)}>
              <option value="">Choose</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeId || "no ID"})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Leave">
            <Select value={reqLeaveTypeId} onChange={(e) => setReqLeaveTypeId(e.target.value)}>
              <option value="">Choose</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.isPaid ? "paid" : "unpaid"})
                </option>
              ))}
            </Select>
          </Field>
        </DrawerSection>

        <DrawerSection title="Dates">
          <Field label="From">
            <Input type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" min={reqStartDate} value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
          </Field>
          {reqStartDate && reqEndDate ? <DrawerRow label="Working days">About {calculatedDays}</DrawerRow> : null}
        </DrawerSection>

        <DrawerSection title="Cover and reason">
          <Field label="Covered by" optional>
            <Select value={reqCoveringId} onChange={(e) => setReqCoveringId(e.target.value)}>
              <option value="">Nobody</option>
              {employees
                .filter((e) => e.id !== reqEmployeeId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Reason">
            <TextArea rows={3} value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
          </Field>
        </DrawerSection>
      </Drawer>
    </PeopleShell>
  );
}
