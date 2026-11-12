"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

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
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  Segmented,
  Select,
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAttendance,
  fetchEmployees,
  fetchSites,
  type AttendanceRecord,
  type Site,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ATTENDANCE_STATUS_LABELS,
  canMarkAttendance,
} from "@/lib/people/attendance";

type ViewTab = "today" | "all";

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

  const records = React.useMemo(
    () => attendanceQuery.data?.data ?? [],
    [attendanceQuery.data]
  );
  const sites = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = React.useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data]
  );

  // Filter records
  const filtered = React.useMemo(() => {
    return records.filter((rec) => {
      if (statusFilter !== "ALL" && rec.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const empName = (rec.employee?.name || "").toLowerCase();
      const shift = (rec.shift || "").toLowerCase();
      const site = (rec.site?.name || "").toLowerCase();
      return empName.includes(q) || shift.includes(q) || site.includes(q);
    });
  }, [records, statusFilter, search]);

  const counts = React.useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let overtimeHours = 0;
    for (const r of records) {
      if (r.status === "PRESENT") present++;
      else if (r.status === "LATE") late++;
      else if (r.status === "ABSENT") absent++;
      if (r.overtime) overtimeHours += r.overtime;
    }
    return { present, late, absent, overtimeHours: Math.round(overtimeHours * 10) / 10 };
  }, [records]);

  // Pagination
  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  // Mutation
  const markMutation = useMutation({
    mutationFn: (values: {
      employeeId: string;
      date: string;
      status: "PRESENT" | "ABSENT" | "LATE";
      overtimeMinutes?: number;
      siteId?: string;
      shiftName?: string;
    }) =>
      fetchJson("/api/people/attendance", {
        method: "POST",
        body: JSON.stringify({
          date: values.date,
          shift: values.shiftName || "DAY SHIFT",
          siteId: values.siteId || undefined,
          records: [
            {
              employeeId: values.employeeId,
              status: values.status,
              overtime: (values.overtimeMinutes ?? 0) / 60,
            },
          ],
        }),
      }),
    onSuccess: () => {
      toast({ title: "Attendance recorded successfully" });
      setMarkDrawerOpen(false);
      setMarkEmployeeId("");
      setMarkOvertime("0");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const selectedRows = React.useMemo(
    () => pageRows.filter((r) => selection.isSelected(r.id)),
    [pageRows, selection]
  );

  const handleBulkStatus = async (status: "PRESENT" | "ABSENT") => {
    try {
      const recordsToUpdate = selectedRows.map((r) => ({
        employeeId: r.employee.id,
        status,
        overtime: r.overtime || 0,
      }));
      await fetchJson("/api/people/attendance", {
        method: "POST",
        body: JSON.stringify({
          date: attendanceDate,
          shift: "DAY SHIFT",
          records: recordsToUpdate,
        }),
      });
      toast({
        title: `Marked ${recordsToUpdate.length} record${recordsToUpdate.length > 1 ? "s" : ""} as ${status.toLowerCase()}`,
      });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleExport = () => {
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      `attendance-${attendanceDate}.csv`,
      ["Date", "Employee", "Status", "Overtime (hrs)", "Shift", "Site"],
      target.map((r) => [
        r.date,
        r.employee?.name || "",
        (ATTENDANCE_STATUS_LABELS as Record<string, string>)[r.status] || r.status,
        r.overtime ? String(r.overtime) : "0.0",
        r.shift || "",
        r.site?.name || "",
      ])
    );
  };

  const columns: Array<WsColumn<AttendanceRecord>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (r) => (
        <Person name={r.employee?.name || "Staff"} />
      ),
    },
    {
      key: "date",
      head: "Date",
      className: "muted mono",
      cell: (r) => r.date,
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone =
          r.status === "PRESENT"
            ? "done"
            : r.status === "LATE"
            ? "warn"
            : r.status === "ABSENT"
            ? "bad"
            : "void";
        return (
          <St tone={tone}>
            {(ATTENDANCE_STATUS_LABELS as Record<string, string>)[r.status] || r.status}
          </St>
        );
      },
    },
    {
      key: "overtime",
      head: "Overtime, hours",
      right: true,
      className: "mono",
      cell: (r) =>
        r.overtime ? r.overtime.toFixed(1) : <None />,
    },
    {
      key: "shift",
      head: "Shift",
      className: "muted",
      cell: (r) => (
        <>
          {r.shift || "Standard"}
          {r.site?.name ? <span className="muted"> {r.site.name}</span> : null}
        </>
      ),
    },
  ];

  const totals = [
    `${totalRows} logs`,
    null,
    `${counts.present} present`,
    `${counts.overtimeHours.toFixed(1)} overtime hours`,
    null,
  ];

  return (
    <PeopleShell
      activeTab="attendance"
      primary={
        canManage
          ? {
              label: "Mark attendance",
              icon: "plus",
              shortcut: "N",
              onClick: () => {
                setMarkDate(attendanceDate);
                setMarkDrawerOpen(true);
              },
            }
          : undefined
      }
    >
      <BkPage screen="attendance" scroll={false}>
        <BkFinding
          fact={`${counts.present} present, ${counts.late} late, ${counts.absent} absent.`}
          rest={attendanceDate}
        />

        <BkTabs
          label="Attendance views"
          value={tab}
          onChange={(v) => {
            setTab(v as ViewTab);
            setPage(1);
          }}
          items={[
            { value: "today", label: "Today", count: tab === "today" ? totalRows : undefined, icon: "clock" },
            { value: "all", label: "By date", count: tab === "all" ? totalRows : undefined, icon: "calendar" },
          ]}
        />

        <BkTools
          find="Search attendance"
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <>
              {tab === "all" ? (
                <Input
                  type="date"
                  aria-label="Date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setPage(1);
                  }}
                />
              ) : null}

              <BkFilter
                label="Status"
                value={
                  statusFilter === "ALL"
                    ? "Any"
                    : (ATTENDANCE_STATUS_LABELS as Record<string, string>)[statusFilter] || statusFilter
                }
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
                    key: "PRESENT",
                    label: "Present",
                    checked: statusFilter === "PRESENT",
                    onSelect: () => {
                      setStatusFilter("PRESENT");
                      setPage(1);
                    },
                  },
                  {
                    key: "LATE",
                    label: "Late",
                    checked: statusFilter === "LATE",
                    onSelect: () => {
                      setStatusFilter("LATE");
                      setPage(1);
                    },
                  },
                  {
                    key: "ABSENT",
                    label: "Absent",
                    checked: statusFilter === "ABSENT",
                    onSelect: () => {
                      setStatusFilter("ABSENT");
                      setPage(1);
                    },
                  },
                ]}
              />
            </>
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="attendance records"
            rows={pageRows}
            rowKey={(r) => r.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (r) => r.employee?.name || "Record",
            }}
            totals={totals}
            empty={
              attendanceQuery.isLoading ? (
                <BooksLoading />
              ) : (
                <BkEmpty>No attendance for {attendanceDate}.</BkEmpty>
              )
            }
          />
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
          {canManage ? (
            <>
              <Button icon="done" onClick={() => void handleBulkStatus("PRESENT")}>
                Mark present
              </Button>
              <Button icon="x" onClick={() => void handleBulkStatus("ABSENT")}>
                Mark absent
              </Button>
            </>
          ) : null}
        </BkSelectionBar>
      </BkPage>

      {/* Guided Drawer for marking attendance */}
      <Drawer
        open={markDrawerOpen}
        onOpenChange={setMarkDrawerOpen}
        title="Mark attendance"
        footer={
          <>
            <Button variant="quiet" onClick={() => setMarkDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={markMutation.isPending}
              disabled={!markEmployeeId}
              onClick={() => {
                const ot = parseFloat(markOvertime) || 0;
                markMutation.mutate({
                  employeeId: markEmployeeId,
                  date: markDate,
                  status: markStatus,
                  overtimeMinutes: Math.round(ot * 60),
                  shiftName: markShift || undefined,
                  siteId: markSiteId || undefined,
                });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <DrawerSection title="Who and when">
          <Field label="Employee">
            <Select value={markEmployeeId} onChange={(e) => setMarkEmployeeId(e.target.value)}>
              <option value="">Choose</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeId || "no ID"})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
          </Field>
        </DrawerSection>

        <DrawerSection title="Status">
          <Field label="Status">
            <Segmented
              label="Status"
              value={markStatus}
              onChange={setMarkStatus}
              items={[
                { value: "PRESENT", label: "Present" },
                { value: "LATE", label: "Late" },
                { value: "ABSENT", label: "Absent" },
              ]}
            />
          </Field>
          <Field label="Overtime, hours" optional>
            <Input type="number" min="0" step="0.5" value={markOvertime} onChange={(e) => setMarkOvertime(e.target.value)} />
          </Field>
        </DrawerSection>

        <DrawerSection title="Shift and site">
          <Field label="Shift" optional>
            <Input value={markShift} onChange={(e) => setMarkShift(e.target.value)} />
          </Field>
          <Field label="Site" optional>
            <Select value={markSiteId} onChange={(e) => setMarkSiteId(e.target.value)}>
              <option value="">Default site</option>
              {sites.map((s: Site) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </DrawerSection>
      </Drawer>
    </PeopleShell>
  );
}
