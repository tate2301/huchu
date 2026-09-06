"use client";

import type { AttendanceStatus } from "@corelithzw/db";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { StatCard } from "@corelithzw/react";

import { Plus, Send, Trash2 } from "@corelithzw/ui/lib/icons";
import { PeopleShell } from "@/components/people/people-shell";
import { EmployeeAvatar } from "@corelithzw/ui/components/employee-avatar";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable, type DataTableQueryState } from "@corelithzw/ui/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { SearchableSelect } from "@corelithzw/ui/components/searchable-select";
import type { SearchableOption } from "@corelithzw/ui/components/searchable-select";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  fetchAttendance,
  fetchEmployees,
  fetchShiftGroupMembers,
  fetchShiftGroupSchedules,
  fetchShiftGroups,
  fetchSites,
  type AttendanceRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  ATTENDANCE_STATUS_LABELS,
  canMarkAttendance,
} from "@/lib/people/attendance";

/**
 * Attendance — the register for a day, and a modal to mark one.
 *
 * Rebuilt against `04-composition.md`. What was here before was a form pretending
 * to be a page: a "Complete attendance in 3 steps" intro block, a context-help
 * strip, then one tall `FormShell` holding shift details, a worker search, two
 * stat cards and the crew list — and no way to see the register you had just
 * written to. Four stacked panels before the first field, and the six-step recipe
 * asks for exactly one body block.
 *
 * So: this is a **list page** — the register is the content, because that is what
 * somebody opening the screen wants to look at. `PageHeader` comes from
 * `PeopleShell`; the day's numbers are `StatCard`, which the composition doc names
 * as *the* block for one number; the register is `DataTable`, which owns the
 * search, pagination and filter contract; and marking a shift is a **`Dialog`**,
 * which owns the focus trap and Escape order that a form inlined into a page does
 * not have.
 *
 * Two actions in the header, one primary, which is the cap. Nothing is duplicated
 * anywhere else on the page.
 *
 * Submitting stays on this page rather than redirecting to `/reports/attendance`
 * as it used to. The register you just added to is the table underneath the modal,
 * so the confirmation is the rows appearing — being thrown onto a different screen
 * after closing a dialog is a worse answer to "did that work?" than showing it.
 */

/**
 * The three a supervisor marks at the crew board.
 *
 * A subset of `AttendanceStatus`, and typed against it so it cannot drift: the
 * other three (`ON_LEAVE`, `REST_DAY`, `HOLIDAY`) are not decisions taken while
 * standing in front of a crew — they come from an approved leave request, a rota
 * or the public-holiday calendar.
 */
type CrewStatus = Extract<AttendanceStatus, "PRESENT" | "ABSENT" | "LATE">;

type CrewWorker = {
  id: string;
  employeeId: string;
  name: string;
  passportPhotoUrl?: string | null;
};

type CrewStatusState = {
  status: CrewStatus;
  overtime: string;
};

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PRESENT: "default",
  LATE: "secondary",
  ABSENT: "destructive",
  ON_LEAVE: "outline",
  REST_DAY: "outline",
  HOLIDAY: "outline",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const canManageAttendance = canMarkAttendance(enabledFeatures);

  const [markOpen, setMarkOpen] = useState(false);
  const [registerDate, setRegisterDate] = useState(today);
  const [registerQuery, setRegisterQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  const [formData, setFormData] = useState({
    date: today(),
    shift: "SHIFT-1",
    siteId: "",
    shiftGroupId: "",
  });
  const [statusByEmployeeId, setStatusByEmployeeId] = useState<Record<string, CrewStatusState>>({});
  const [extraWorkers, setExtraWorkers] = useState<CrewWorker[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");

  // --- The register. This is the page.
  const {
    data: registerData,
    isLoading: registerLoading,
    error: registerError,
  } = useQuery({
    queryKey: [
      "attendance",
      "register",
      registerDate,
      registerQuery.page,
      registerQuery.pageSize,
      registerQuery.search,
    ],
    queryFn: () =>
      fetchAttendance({
        date: registerDate,
        search: registerQuery.search || undefined,
        page: registerQuery.page,
        limit: registerQuery.pageSize,
      }),
    enabled: canManageAttendance,
  });
  const register = useMemo(() => registerData?.data ?? [], [registerData]);

  /**
   * The day's totals, counted by the server rather than from the loaded page.
   *
   * Three `limit: 1` requests read `pagination.total` each. Counting the rows in
   * `register` instead would have been one fewer round trip and quietly wrong the
   * moment a register ran past 25 people — a number captioned "Present today"
   * that actually means "present on this page" is worse than no number.
   */
  const dayTotals = useQuery({
    queryKey: ["attendance", "register", "totals", registerDate],
    queryFn: async () => {
      const [present, late, absent] = await Promise.all([
        fetchAttendance({ date: registerDate, status: "PRESENT", limit: 1 }),
        fetchAttendance({ date: registerDate, status: "LATE", limit: 1 }),
        fetchAttendance({ date: registerDate, status: "ABSENT", limit: 1 }),
      ]);
      return {
        present: present.pagination.total,
        late: late.pagination.total,
        absent: absent.pagination.total,
      };
    },
    enabled: canManageAttendance,
  });

  // --- Everything the marking modal needs.
  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
    enabled: canManageAttendance,
  });
  // "" means no site, which is a legitimate answer rather than a missing one: a
  // bureau or a school has a workforce and no shafts. It only defaults to the
  // first site when there is one to default to.
  const activeSiteId = formData.siteId || sites?.[0]?.id || "";
  const hasSites = (sites?.length ?? 0) > 0;

  const {
    data: shiftGroupsData,
    isLoading: shiftGroupsLoading,
    error: shiftGroupsError,
  } = useQuery({
    queryKey: ["shift-groups", "attendance", activeSiteId],
    queryFn: () =>
      fetchShiftGroups({ siteId: activeSiteId || undefined, active: true, limit: 300 }),
    // Not gated on a site. Gating it meant a siteless tenant was offered no crews
    // at all, which made the whole screen unusable — the site is a narrowing, not
    // a prerequisite.
    enabled: canManageAttendance,
  });
  const shiftGroups = useMemo(() => shiftGroupsData?.data ?? [], [shiftGroupsData]);

  const { data: scheduleData } = useQuery({
    queryKey: ["shift-group-schedules", "attendance", activeSiteId, formData.date, formData.shift],
    queryFn: () =>
      fetchShiftGroupSchedules({
        siteId: activeSiteId || undefined,
        date: formData.date,
        shift: formData.shift,
        limit: 10,
      }),
    enabled: Boolean(formData.date && formData.shift && canManageAttendance),
  });

  const scheduledShiftGroupId = scheduleData?.data?.[0]?.shiftGroupId ?? "";
  const effectiveShiftGroupId = formData.shiftGroupId || scheduledShiftGroupId;
  const selectedShiftGroup = shiftGroups.find((group) => group.id === effectiveShiftGroupId);
  const effectiveShiftLeaderId =
    selectedShiftGroup?.leaderEmployeeId ?? scheduleData?.data?.[0]?.shiftGroup?.leader?.id ?? "";

  const {
    data: groupMembersData,
    isLoading: groupMembersLoading,
    error: groupMembersError,
  } = useQuery({
    queryKey: ["shift-group-members", effectiveShiftGroupId],
    queryFn: () => fetchShiftGroupMembers(effectiveShiftGroupId, { active: true }),
    enabled: Boolean(effectiveShiftGroupId && canManageAttendance),
  });

  const baseWorkers = useMemo<CrewWorker[]>(
    () =>
      (groupMembersData?.data ?? []).map((member) => ({
        id: member.employee.id,
        employeeId: member.employee.employeeId,
        name: member.employee.name,
        passportPhotoUrl: undefined,
      })),
    [groupMembersData],
  );

  const crewWorkers = useMemo(() => {
    const map = new Map<string, CrewWorker>();
    for (const worker of baseWorkers) map.set(worker.id, worker);
    for (const worker of extraWorkers) map.set(worker.id, worker);
    return Array.from(map.values());
  }, [baseWorkers, extraWorkers]);

  const crew = useMemo(
    () =>
      crewWorkers.map((worker) => ({
        ...worker,
        status: statusByEmployeeId[worker.id]?.status ?? "PRESENT",
        overtime: statusByEmployeeId[worker.id]?.overtime ?? "",
      })),
    [crewWorkers, statusByEmployeeId],
  );

  const { data: workerSearchData } = useQuery({
    queryKey: ["employees", "attendance", "search", workerSearch],
    queryFn: () => fetchEmployees({ active: true, search: workerSearch.trim(), limit: 12 }),
    enabled: canManageAttendance && workerSearch.trim().length >= 2,
  });
  const workerSearchResults = useMemo(() => workerSearchData?.data ?? [], [workerSearchData]);

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      /** Omitted entirely on a tenant with no sites; the server computes it. */
      siteId?: string;
      shift: string;
      shiftGroupId?: string;
      shiftLeaderId?: string;
      records: Array<{ employeeId: string; status: CrewStatus; overtime?: number }>;
    }) =>
      fetchJson("/api/people/attendance", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, payload) => {
      toast({
        title: "Attendance recorded",
        description: `${payload.records.length} marked for ${payload.shift}.`,
        variant: "success",
      });
      // Show the day that was just marked, so the new rows are what appears
      // underneath as the dialog closes.
      setRegisterDate(payload.date.slice(0, 10));
      setRegisterQuery((prev) => ({ ...prev, page: 1 }));
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      resetShiftContext();
      setMarkOpen(false);
    },
    onError: (error) =>
      toast({
        title: "Unable to record attendance",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const shiftGroupOptions = useMemo<SearchableOption[]>(
    () =>
      shiftGroups.map((group) => ({
        value: group.id,
        label: group.name,
        description: `Leader: ${group.leader?.name ?? "Not set"}`,
        meta: group.code || group.site?.code || undefined,
      })),
    [shiftGroups],
  );

  const updateCrew = (id: string, next: Partial<CrewStatusState>) => {
    setStatusByEmployeeId((prev) => ({
      ...prev,
      [id]: { status: prev[id]?.status ?? "PRESENT", overtime: prev[id]?.overtime ?? "", ...next },
    }));
  };

  const removeExtraWorker = (workerId: string) => {
    setExtraWorkers((prev) => prev.filter((worker) => worker.id !== workerId));
  };

  function resetShiftContext() {
    setStatusByEmployeeId({});
    setExtraWorkers([]);
    setWorkerSearch("");
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // The crew is the only requirement. Where it worked is computed from the crew
    // server-side, and on a tenant with no sites there is nothing to compute.
    if (!effectiveShiftGroupId) {
      toast({
        title: "Missing details",
        description: "Choose a shift group.",
        variant: "destructive",
      });
      return;
    }

    attendanceMutation.mutate({
      date: formData.date,
      siteId: activeSiteId || undefined,
      shift: formData.shift,
      shiftGroupId: effectiveShiftGroupId,
      shiftLeaderId: effectiveShiftLeaderId || undefined,
      records: crew.map((member) => ({
        employeeId: member.id,
        status: member.status,
        overtime:
          member.status === "ABSENT" || member.overtime.trim() === ""
            ? undefined
            : Number(member.overtime),
      })),
    });
  };

  const markedPresent = crew.filter((m) => m.status === "PRESENT" || m.status === "LATE").length;
  const markedAbsent = crew.filter((m) => m.status === "ABSENT").length;

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(
    () => [
      {
        accessorKey: "employee",
        header: "Employee",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <EmployeeAvatar name={row.original.employee.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.employee.name}</div>
              <div className="text-sm text-muted-foreground">
                {row.original.employee.employeeId}
              </div>
            </div>
          </div>
        ),
      },
      { accessorKey: "shift", header: "Shift" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_TONE[row.original.status] ?? "outline"}>
            {ATTENDANCE_STATUS_LABELS[row.original.status as AttendanceStatus] ??
              row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "overtime",
        header: "Overtime",
        cell: ({ row }) =>
          row.original.overtime ? `${row.original.overtime} h` : <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "shiftGroup",
        header: "Crew",
        cell: ({ row }) => row.original.shiftGroup?.name ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "site",
        header: "Site",
        // "Whole company" rather than a dash: a register with no site is the
        // ordinary shape off a mine, not missing data.
        cell: ({ row }) => row.original.site?.name ?? "Whole company",
      },
    ],
    [],
  );

  if (sessionStatus === "loading") {
    return (
      <PeopleShell activeTab="attendance" title="Attendance">
        <Skeleton className="h-64 w-full" />
      </PeopleShell>
    );
  }

  if (!canManageAttendance) {
    return (
      <PeopleShell activeTab="attendance" title="Attendance">
        <Alert variant="destructive">
          <AlertTitle>Restricted access</AlertTitle>
          <AlertDescription>
            You do not have permission to view or mark the attendance register.
          </AlertDescription>
        </Alert>
      </PeopleShell>
    );
  }

  return (
    <PeopleShell
      activeTab="attendance"
      title="Attendance"
      actions={
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMarkOpen(true)}>
            <Plus className="size-4" />
            Mark attendance
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/reports/attendance")}>
            History
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* The day's numbers. `StatCard` children in a plain grid — no section
            shell around them, because a card holding cards is two borders saying
            the same thing. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Present"
            value={dayTotals.data ? dayTotals.data.present : "—"}
            delta={dayTotals.data?.late ? `${dayTotals.data.late} late` : undefined}
          />
          <StatCard label="Absent" value={dayTotals.data ? dayTotals.data.absent : "—"} />
          <StatCard
            label="Marked"
            value={
              dayTotals.data
                ? dayTotals.data.present + dayTotals.data.late + dayTotals.data.absent
                : "—"
            }
            footer={registerDate}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto">
            <Label htmlFor="register-date">Register for</Label>
            <Input
              id="register-date"
              type="date"
              className="h-8 w-full sm:w-44"
              value={registerDate}
              onChange={(event) => {
                setRegisterDate(event.target.value);
                setRegisterQuery((prev) => ({ ...prev, page: 1 }));
              }}
            />
          </div>
        </div>

        {registerError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load the register</AlertTitle>
            <AlertDescription>{getApiErrorMessage(registerError)}</AlertDescription>
          </Alert>
        ) : registerLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : register.length === 0 ? (
          <div className="section-shell text-sm text-muted-foreground">
            Nobody marked for {registerDate} yet.
          </div>
        ) : (
          <DataTable
            data={register}
            columns={columns}
            queryState={registerQuery}
            onQueryStateChange={(next) => setRegisterQuery((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search name or staff number"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            // Its own container, not an `overflow-x-auto` wrapper of mine. Wrapping
            // it put the toolbar inside a scroll box too, so the search field and
            // the export button were clipped at opposite edges the moment the
            // columns outgrew the width.
            tableContainerClassName="overflow-x-auto"
            pagination={{ enabled: true }}
          />
        )}
      </div>

      {/* Marking a shift. A dialog rather than an inline form: it owns the focus
          trap and the Escape order, and it keeps the register as the page. */}
      <Dialog
        open={markOpen}
        onOpenChange={(next) => {
          setMarkOpen(next);
          if (!next) resetShiftContext();
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              Pick the shift and crew, then mark each worker. Overtime is optional.
            </DialogDescription>
          </DialogHeader>

          {/*
            `FormShell variant="bare"` rather than a raw `<form>`: it is the same
            shape `components/stores/stock-movement-dialog.tsx` uses, and "bare" is
            documented as the variant for exactly this — a form inside a dialog,
            with no `Card` around it, because a card inside a modal is two borders
            saying the same thing. It also owns the error list and the required
            hint, which is one fewer thing for each dialog to reinvent.
          */}
          <FormShell
            variant="bare"
            onSubmit={handleSubmit}
            requiredHint="Every crew member gets a status. Overtime is optional."
            errors={
              shiftGroupsError || groupMembersError
                ? [getApiErrorMessage(shiftGroupsError ?? groupMembersError)]
                : undefined
            }
            errorTitle="Unable to load crews"
            actions={
              <>
                <Button type="button" variant="outline" onClick={() => setMarkOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={attendanceMutation.isPending || crew.length === 0}
                >
                  <Send className="size-4" />
                  {attendanceMutation.isPending ? "Recording…" : "Record attendance"}
                </Button>
              </>
            }
          >

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="mark-date">Date</Label>
                <Input
                  id="mark-date"
                  type="date"
                  value={formData.date}
                  onChange={(event) => {
                    setFormData((prev) => ({ ...prev, date: event.target.value, shiftGroupId: "" }));
                    resetShiftContext();
                  }}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mark-shift">Shift</Label>
                <Input
                  id="mark-shift"
                  value={formData.shift}
                  onChange={(event) => {
                    setFormData((prev) => ({
                      ...prev,
                      shift: event.target.value,
                      shiftGroupId: "",
                    }));
                    resetShiftContext();
                  }}
                  placeholder="e.g. SHIFT-1"
                  required
                />
              </div>
              {/*
                Only rendered when there is a site to choose. A required field with
                an empty dropdown is a dead end, and it is what made this screen
                unusable on any tenant without shafts — the register never needed
                one, and the crew's site is used when it has one.
              */}
              {sitesLoading ? (
                <div>
                  <Label>Site</Label>
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : hasSites ? (
                <div>
                  <Label>Site</Label>
                  <Select
                    value={activeSiteId || undefined}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, siteId: value, shiftGroupId: "" }));
                      resetShiftContext();
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All sites" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp hint="Narrows the crews below. Taken from the crew when left alone." />
                </div>
              ) : null}
            </div>

            {shiftGroupsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <SearchableSelect
                label="Crew"
                value={effectiveShiftGroupId || undefined}
                options={shiftGroupOptions}
                placeholder="Search crew"
                searchPlaceholder="Search crew name or leader..."
                onValueChange={(value) => {
                  setFormData((prev) => ({ ...prev, shiftGroupId: value }));
                  resetShiftContext();
                }}
                onAddOption={() => router.push("/people/rosters")}
                addLabel="Manage crews"
              />
            )}

            {selectedShiftGroup?.leader?.name ? (
              <p className="text-sm text-muted-foreground">
                Shift leader: {selectedShiftGroup.leader.name} (
                {selectedShiftGroup.leader.employeeId})
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="mark-extra">Add someone outside the crew</Label>
              <Input
                id="mark-extra"
                value={workerSearch}
                onChange={(event) => setWorkerSearch(event.target.value)}
                placeholder="Search by name or staff number"
              />
              {workerSearch.trim().length >= 2 ? (
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border p-2">
                  {workerSearchResults.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No workers found.</div>
                  ) : (
                    workerSearchResults.map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setExtraWorkers((prev) =>
                            prev.some((worker) => worker.id === employee.id)
                              ? prev
                              : [
                                  ...prev,
                                  {
                                    id: employee.id,
                                    name: employee.name,
                                    employeeId: employee.employeeId,
                                    passportPhotoUrl: employee.passportPhotoUrl,
                                  },
                                ],
                          );
                          setWorkerSearch("");
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <EmployeeAvatar
                            name={employee.name}
                            photoUrl={employee.passportPhotoUrl}
                            size="sm"
                          />
                          <span className="truncate">{employee.name}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {employee.employeeId}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Crew</Label>
                <span className="text-sm text-muted-foreground">
                  {markedPresent} in · {markedAbsent} out
                </span>
              </div>
              {groupMembersLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : crew.length === 0 ? (
                <div className="rounded-[var(--radius-sm)] border border-border p-3 text-sm text-muted-foreground">
                  Choose a crew to mark its members.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {crew.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-2 border-b border-border pb-2 last:border-0 md:flex-row md:items-center"
                    >
                      <div className="flex flex-1 items-center gap-2">
                        <EmployeeAvatar
                          name={member.name}
                          photoUrl={member.passportPhotoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{member.name}</div>
                          <div className="text-sm text-muted-foreground">{member.employeeId}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(["PRESENT", "LATE", "ABSENT"] as CrewStatus[]).map((status) => (
                          <Button
                            key={status}
                            type="button"
                            size="sm"
                            variant={
                              member.status === status
                                ? status === "ABSENT"
                                  ? "destructive"
                                  : status === "LATE"
                                    ? "secondary"
                                    : "default"
                                : "outline"
                            }
                            onClick={() => updateCrew(member.id, { status })}
                          >
                            {ATTENDANCE_STATUS_LABELS[status]}
                          </Button>
                        ))}
                      </div>
                      {member.status !== "ABSENT" ? (
                        <Input
                          type="number"
                          step="0.5"
                          className="h-8 w-full md:w-24"
                          placeholder="OT hrs"
                          aria-label={`Overtime hours for ${member.name}`}
                          value={member.overtime}
                          onChange={(event) =>
                            updateCrew(member.id, { overtime: event.target.value })
                          }
                        />
                      ) : null}
                      {extraWorkers.some((worker) => worker.id === member.id) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => removeExtraWorker(member.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </FormShell>
        </DialogContent>
      </Dialog>
    </PeopleShell>
  );
}
