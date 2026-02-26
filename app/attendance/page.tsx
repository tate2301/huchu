"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Save, Send, Trash2, UserCheck, UserX } from "@/lib/icons";

import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { ContextHelp } from "@/components/shared/context-help";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEmployees,
  fetchShiftGroupMembers,
  fetchShiftGroupSchedules,
  fetchShiftGroups,
  fetchSites,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";

type CrewStatus = "PRESENT" | "ABSENT" | "LATE";

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

export default function AttendancePage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    shift: "SHIFT-1",
    siteId: "",
    shiftGroupId: "",
  });
  const [statusByEmployeeId, setStatusByEmployeeId] = useState<Record<string, CrewStatusState>>({});
  const [extraWorkers, setExtraWorkers] = useState<CrewWorker[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = formData.siteId || sites?.[0]?.id || "";

  const {
    data: shiftGroupsData,
    isLoading: shiftGroupsLoading,
    error: shiftGroupsError,
  } = useQuery({
    queryKey: ["shift-groups", "attendance", activeSiteId],
    queryFn: () =>
      fetchShiftGroups({
        siteId: activeSiteId || undefined,
        active: true,
        limit: 300,
      }),
    enabled: Boolean(activeSiteId),
  });
  const shiftGroups = useMemo(() => shiftGroupsData?.data ?? [], [shiftGroupsData]);

  const { data: scheduleData } = useQuery({
    queryKey: ["shift-group-schedules", "attendance", activeSiteId, formData.date, formData.shift],
    queryFn: () =>
      fetchShiftGroupSchedules({
        siteId: activeSiteId,
        date: formData.date,
        shift: formData.shift,
        limit: 10,
      }),
    enabled: Boolean(activeSiteId && formData.date && formData.shift),
  });

  const scheduledShiftGroupId = scheduleData?.data?.[0]?.shiftGroupId ?? "";
  const effectiveShiftGroupId = formData.shiftGroupId || scheduledShiftGroupId;
  const selectedShiftGroup = shiftGroups.find((group) => group.id === effectiveShiftGroupId);
  const effectiveShiftLeaderId =
    selectedShiftGroup?.leaderEmployeeId ??
    scheduleData?.data?.[0]?.shiftGroup?.leader?.id ??
    "";

  const {
    data: groupMembersData,
    isLoading: groupMembersLoading,
    error: groupMembersError,
  } = useQuery({
    queryKey: ["shift-group-members", effectiveShiftGroupId],
    queryFn: () => fetchShiftGroupMembers(effectiveShiftGroupId, { active: true }),
    enabled: Boolean(effectiveShiftGroupId),
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
    enabled: workerSearch.trim().length >= 2,
  });
  const workerSearchResults = useMemo(() => workerSearchData?.data ?? [], [workerSearchData]);

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      siteId: string;
      shift: string;
      shiftGroupId?: string;
      shiftLeaderId?: string;
      records: Array<{
        employeeId: string;
        status: CrewStatus;
        overtime?: number;
      }>;
    }) =>
      fetchJson("/api/attendance", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, payload) => {
      toast({
        title: "Attendance submitted",
        description: "Crew attendance has been recorded.",
        variant: "success",
      });
      const reportDate = payload.date.slice(0, 10);
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      const destination = buildSavedRecordRedirect(
        "/reports/attendance",
        {
          createdId: `${payload.siteId}:${payload.shift}:${reportDate}`,
          createdAt: new Date(payload.date),
          source: "attendance",
        },
        {
          siteId: payload.siteId,
          startDate: reportDate,
          endDate: reportDate,
          batchDate: reportDate,
          batchShift: payload.shift,
          batchSiteId: payload.siteId,
        },
      );
      router.push(destination);
    },
    onError: (error) =>
      toast({
        title: "Unable to submit attendance",
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

  const resetShiftContext = () => {
    setStatusByEmployeeId({});
    setExtraWorkers([]);
    setWorkerSearch("");
  };

  const handleSaveDraft = () => {
    localStorage.setItem(
      "attendanceDraft",
      JSON.stringify({
        ...formData,
        siteId: activeSiteId,
        shiftGroupId: effectiveShiftGroupId,
        shiftLeaderId: effectiveShiftLeaderId,
        crew,
        savedAt: new Date().toISOString(),
      }),
    );
    toast({ title: "Draft saved", description: "Attendance saved locally on this device." });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSiteId || !effectiveShiftGroupId) {
      toast({
        title: "Missing details",
        description: "Site and shift group are required.",
        variant: "destructive",
      });
      return;
    }

    const records = crew.map((member) => ({
      employeeId: member.id,
      status: member.status,
      overtime: member.status === "ABSENT" || member.overtime.trim() === "" ? undefined : Number(member.overtime),
    }));

    attendanceMutation.mutate({
      date: formData.date,
      siteId: activeSiteId,
      shift: formData.shift,
      shiftGroupId: effectiveShiftGroupId,
      shiftLeaderId: effectiveShiftLeaderId || undefined,
      records,
    });
  };

  const presentCount = crew.filter((m) => m.status === "PRESENT" || m.status === "LATE").length;
  const absentCount = crew.filter((m) => m.status === "ABSENT").length;

  const loading = sitesLoading || groupMembersLoading;
  const error = sitesError || shiftGroupsError || groupMembersError || attendanceMutation.error;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" asChild variant="outline">
          <Link href="/reports/attendance">View Attendance Records</Link>
        </Button>
      </PageActions>

      <PageHeading title="Daily Attendance" description="Track crew presence and overtime" />
      <PageIntro
        title="Complete attendance in 3 steps"
        purpose="Step 1: choose date, shift, site, and group. Step 2: mark each worker status. Step 3: submit and verify in history."
        nextStep="Confirm Shift Details first, then mark crew attendance."
      />
      <ContextHelp href="/help#attendance" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to submit attendance</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <FormShell
        title="Attendance Entry Form"
        description="Set shift details, mark crew status, and submit attendance."
        onSubmit={handleSubmit}
        formClassName="space-y-6"
        requiredHint="Fields marked * are required."
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleSaveDraft} className="flex-1 sm:flex-none">
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button type="submit" disabled={attendanceMutation.isPending} className="flex-1 sm:flex-none">
              <Send className="mr-2 h-4 w-4" />
              Submit Attendance
            </Button>
          </>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Shift Details</CardTitle>
            <CardDescription>Date, shift, site, group, and shift leader</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, date: e.target.value, shiftGroupId: "" }));
                    resetShiftContext();
                  }}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Shift *</label>
                <Input
                  value={formData.shift}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, shift: e.target.value, shiftGroupId: "" }));
                    resetShiftContext();
                  }}
                  placeholder="e.g. SHIFT-1, SHIFT-2, SHIFT-3"
                  required
                />
                <FieldHelp hint="Use the shift label for this run (for example SHIFT-1)." />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={activeSiteId || undefined}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, siteId: value, shiftGroupId: "" }));
                      resetShiftContext();
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {shiftGroupsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <SearchableSelect
                label="Shift Group *"
                value={effectiveShiftGroupId || undefined}
                options={shiftGroupOptions}
                placeholder="Search shift group"
                searchPlaceholder="Search group name or leader..."
                onValueChange={(value) => {
                  setFormData((prev) => ({ ...prev, shiftGroupId: value }));
                  resetShiftContext();
                }}
                onAddOption={() => router.push("/human-resources/shift-groups")}
                addLabel="Manage shift groups"
              />
            )}

            <div>
              <label className="mb-2 block text-sm font-semibold">Shift Leader (Auto)</label>
              {selectedShiftGroup?.leader?.name ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <EmployeeAvatar name={selectedShiftGroup.leader.name} size="sm" />
                  <div>
                    <div className="text-sm font-medium">{selectedShiftGroup.leader.name}</div>
                    <div className="text-xs text-muted-foreground">{selectedShiftGroup.leader.employeeId}</div>
                  </div>
                </div>
              ) : (
                <Input value="" readOnly placeholder="Auto from group leader" />
              )}
              <FieldHelp hint="Group leader is automatically used as shift leader for attendance." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Out-of-Group Worker</CardTitle>
            <CardDescription>Add extra workers who joined this shift.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={workerSearch} onChange={(e) => setWorkerSearch(e.target.value)} placeholder="Search worker by name or ID" />
            {workerSearch.trim().length >= 2 ? (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded border border-border p-2">
                {workerSearchResults.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No workers found.</div>
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
                        <EmployeeAvatar name={employee.name} photoUrl={employee.passportPhotoUrl} size="sm" />
                        <span className="truncate">{employee.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{employee.employeeId}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
            {extraWorkers.length > 0 ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                <div className="text-xs font-semibold text-muted-foreground">Added workers preview</div>
                {extraWorkers.map((worker) => (
                  <div
                    key={worker.id}
                    className="flex items-center justify-between gap-2 rounded bg-background px-2 py-1"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <EmployeeAvatar
                        name={worker.name}
                        photoUrl={worker.passportPhotoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{worker.name}</div>
                        <div className="text-xs text-muted-foreground">{worker.employeeId}</div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeExtraWorker(worker.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <FrappeStatCard
            label="Present"
            value={presentCount}
            valueLabel={presentCount.toLocaleString()}
            tone="success"
            titleAdornment={<UserCheck className="h-4 w-4 text-green-600" />}
          />
          <FrappeStatCard
            label="Absent"
            value={absentCount}
            valueLabel={absentCount.toLocaleString()}
            tone="danger"
            negativeIsBetter
            titleAdornment={<UserX className="h-4 w-4 text-red-600" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Crew Attendance</CardTitle>
            <CardDescription>Mark attendance for each worker</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <StatusState variant="loading" title="Loading crew list" description="Please wait while we fetch shift group members." />
            ) : crew.length === 0 ? (
              <StatusState variant="empty" title="No crew members available" description="Select a shift group or add workers." />
            ) : (
              <div className="space-y-3">
                {crew.map((member) => (
                  <div key={member.id} className="flex flex-col gap-3 rounded-md border border-border bg-card/60 p-3 md:flex-row md:items-center">
                    <div className="flex flex-1 items-center gap-2">
                      <EmployeeAvatar name={member.name} photoUrl={member.passportPhotoUrl} size="sm" />
                      <div>
                        <div className="font-semibold">{member.name}</div>
                        <div className="text-xs text-muted-foreground">ID: {member.employeeId}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant={member.status === "PRESENT" ? "default" : "outline"} onClick={() => updateCrew(member.id, { status: "PRESENT" })}>Present</Button>
                      <Button type="button" size="sm" variant={member.status === "LATE" ? "secondary" : "outline"} onClick={() => updateCrew(member.id, { status: "LATE" })}>Late</Button>
                      <Button type="button" size="sm" variant={member.status === "ABSENT" ? "destructive" : "outline"} onClick={() => updateCrew(member.id, { status: "ABSENT" })}>Absent</Button>
                    </div>
                    {(member.status === "PRESENT" || member.status === "LATE") ? (
                      <div className="w-full md:w-32">
                        <Input type="number" placeholder="OT hrs" value={member.overtime} onChange={(e) => updateCrew(member.id, { overtime: e.target.value })} step="0.5" className="h-9" />
                        <FieldHelp hint="Optional overtime in hours." />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FormShell>
    </div>
  );
}
