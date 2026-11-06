"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

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
import {
  fetchAttendance,
  fetchEmployees,
  fetchSites,
  type Site,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ATTENDANCE_STATUS_LABELS,
  canMarkAttendance,
} from "@/lib/people/attendance";

type ViewTab = "today" | "all";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "plain"> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  ON_LEAVE: "plain",
  REST_DAY: "plain",
  HOLIDAY: "plain",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const canManage = canMarkAttendance(enabledFeatures);

  const [tab, setTab] = React.useState<ViewTab>("today");
  const [selectedDate, setSelectedDate] = React.useState(todayIso);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // Drawer
  const [markDrawerOpen, setMarkDrawerOpen] = React.useState(false);
  const [markEmployeeId, setMarkEmployeeId] = React.useState("");
  const [markStatus, setMarkStatus] = React.useState<"PRESENT" | "ABSENT" | "LATE">("PRESENT");
  const [markOvertime, setMarkOvertime] = React.useState("0");
  const [markSiteId, setMarkSiteId] = React.useState("");
  const [markShift, setMarkShift] = React.useState("Day Shift");
  const [markDate, setMarkDate] = React.useState(todayIso);

  // Queries
  const attendanceDate = tab === "today" ? todayIso() : selectedDate;
  const attendanceQuery = useQuery({
    queryKey: ["attendance", attendanceDate, tab],
    queryFn: () =>
      fetchAttendance({
        date: tab === "today" ? todayIso() : selectedDate,
        limit: 250,
      }),
  });

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "attendance-picker"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });

  const records = React.useMemo(() => attendanceQuery.data?.data ?? [], [attendanceQuery.data]);
  const sites = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = React.useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data]);

  // Mutations
  const markMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          employeeId: markEmployeeId || employees[0]?.id,
          date: markDate,
          shift: markShift,
          status: markStatus,
          overtimeHours: Number(markOvertime) || 0,
          siteId: markSiteId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Attendance recorded", variant: "success" });
      setMarkDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => {
      toast({ title: "Unable to record attendance", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/attendance/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Record deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  // Filtered
  const filteredRecords = React.useMemo(() => {
    let list = [...records];
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.employee.name.toLowerCase().includes(q) ||
          r.employee.employeeId.toLowerCase().includes(q) ||
          (r.shift && r.shift.toLowerCase().includes(q))
      );
    }
    return list;
  }, [records, statusFilter, search]);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredRecords.length);
  const pagedRecords = React.useMemo(
    () => filteredRecords.slice((page - 1) * pageSize, page * pageSize),
    [filteredRecords, page, pageSize]
  );

  const pagedIds = React.useMemo(() => pagedRecords.map((r) => r.id), [pagedRecords]);
  const selection = useSelection(pagedIds);

  const handleExportCsv = () => {
    const csv = [
      ["Employee ID", "Name", "Date", "Shift", "Status", "Overtime Hours", "Site"],
      ...filteredRecords.map((r) => [
        r.employee.employeeId,
        r.employee.name,
        r.date.slice(0, 10),
        r.shift || "",
        r.status,
        String(r.overtime ?? 0),
        r.site?.name || "",
      ]),
    ];
    downloadCsv(`attendance-${attendanceDate}.csv`, csv);
  };

  const selectedEmployee = React.useMemo(
    () => employees.find((e) => e.id === markEmployeeId) || employees[0],
    [employees, markEmployeeId]
  );

  const statusLabel =
    statusFilter === "ALL"
      ? "All statuses"
      : ATTENDANCE_STATUS_LABELS[statusFilter as keyof typeof ATTENDANCE_STATUS_LABELS] || statusFilter;

  return (
    <PeopleShell
      activeTab="attendance"
      title="Attendance Register"
      actions={
        canManage ? (
          <Button
            variant="primary"
            icon="plus"
            shortcut="N"
            onClick={() => {
              if (employees[0]) setMarkEmployeeId(employees[0].id);
              if (sites[0]) setMarkSiteId(sites[0].id);
              setMarkDrawerOpen(true);
            }}
          >
            Mark attendance
          </Button>
        ) : undefined
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Attendance views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "today", label: "Today's register", count: records.length },
                { value: "all", label: "Date history" },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search staff attendance..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredRecords.length} of ${records.length}`}
              chips={
                <>
                  {tab === "all" ? (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <span className="muted">Date:</span>
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ height: 32, width: 140 }}
                      />
                    </label>
                  ) : null}

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
                      ...(["PRESENT", "LATE", "ABSENT", "ON_LEAVE"] as const).map((st) => ({
                        key: st,
                        label: ATTENDANCE_STATUS_LABELS[st] || st,
                        checked: statusFilter === st,
                        onSelect: () => setStatusFilter(st),
                      })),
                    ]}
                  />
                </>
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Attendance register"
              foot={
                <TableFoot
                  range={filteredRecords.length === 0 ? "None" : `${from} to ${to} of ${filteredRecords.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredRecords.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selection.selected.size,
                    onClear: selection.clear,
                    actions: (
                      <Button icon="export" onClick={handleExportCsv}>
                        Export selected
                      </Button>
                    ),
                  }}
                />
              }
            >
              {filteredRecords.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No attendance recorded for this date</b>
                  <p className="muted">Use Mark attendance to check staff into their shifts.</p>
                </div>
              ) : (
                <table className="table" aria-label="Attendance register">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 260 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 70 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all rows"
                      />
                      <th>Employee</th>
                      <th>Date & Shift</th>
                      <th>Site</th>
                      <th className="num">Overtime</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((record) => {
                      const isSelected = selection.isSelected(record.id);
                      return (
                        <tr key={record.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(record.id)}
                            label={`Select ${record.employee.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={record.employee.name} />
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                  {record.employee.name}
                                </span>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {record.employee.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div>{record.date.slice(0, 10)}</div>
                            <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                              {record.shift || "Standard shift"}
                            </div>
                          </td>
                          <td>{record.site?.name ?? <span className="muted">—</span>}</td>
                          <td className="num">
                            {Number(record.overtime) > 0 ? (
                              <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>
                                +{record.overtime}h
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <BkState tone={STATUS_TONE[record.status] || "plain"}>
                              {ATTENDANCE_STATUS_LABELS[record.status as keyof typeof ATTENDANCE_STATUS_LABELS] ||
                                record.status}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {canManage ? (
                              <Button
                                size="sm"
                                variant="quiet"
                                icon="retire"
                                aria-label="Delete attendance"
                                onClick={() => deleteMutation.mutate(record.id)}
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED MARK ATTENDANCE DRAWER */}
            <Drawer
              open={markDrawerOpen}
              onOpenChange={setMarkDrawerOpen}
              title="Mark staff attendance"
              sub="Record check-in status and overtime for the shift roster."
              width={480}
              footer={
                <>
                  <Button onClick={() => setMarkDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={markMutation.isPending}
                    onClick={() => markMutation.mutate()}
                  >
                    Save attendance
                  </Button>
                </>
              }
            >
              <DrawerSection title="Staff Member">
                <Field label="Employee" htmlFor="att-emp">
                  <select
                    id="att-emp"
                    className="select"
                    value={markEmployeeId}
                    onChange={(e) => setMarkEmployeeId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employeeId})
                      </option>
                    ))}
                  </select>
                </Field>

                {selectedEmployee ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <Person name={selectedEmployee.name} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{selectedEmployee.name}</div>
                      <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                        {selectedEmployee.department?.name || "Operations"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </DrawerSection>

              <DrawerSection title="Shift & Status">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Date" htmlFor="att-date">
                    <Input
                      id="att-date"
                      type="date"
                      value={markDate}
                      onChange={(e) => setMarkDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Shift" htmlFor="att-shift">
                    <Input
                      id="att-shift"
                      value={markShift}
                      onChange={(e) => setMarkShift(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Site / Location" htmlFor="att-site" optional>
                    <select
                      id="att-site"
                      className="select"
                      value={markSiteId}
                      onChange={(e) => setMarkSiteId(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="">Default Site</option>
                      {sites.map((s: Site) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Overtime hours" htmlFor="att-ot">
                    <Input
                      id="att-ot"
                      type="number"
                      min="0"
                      step="0.5"
                      value={markOvertime}
                      onChange={(e) => setMarkOvertime(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Attendance Status
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["PRESENT", "LATE", "ABSENT"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setMarkStatus(status)}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: 6,
                          border:
                            markStatus === status
                              ? "2px solid var(--color-ink)"
                              : "1px solid var(--color-line)",
                          background:
                            markStatus === status ? "var(--color-surface)" : "transparent",
                          fontWeight: markStatus === status ? 600 : 400,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        {status === "PRESENT" ? "• Present" : status === "LATE" ? "• Late" : "• Absent"}
                      </button>
                    ))}
                  </div>
                </div>
              </DrawerSection>
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
