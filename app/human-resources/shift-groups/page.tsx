"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "@/lib/icons"

import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { VerticalDataViews } from "@/components/ui/vertical-data-views"
import {
  archiveShiftGroup,
  createShiftGroup,
  createShiftGroupSchedule,
  deleteShiftGroupSchedule,
  fetchEmployees,
  fetchShiftGroups,
  fetchShiftGroupSchedules,
  fetchSites,
  type EmployeeSummary,
  type ShiftGroupRecord,
  type ShiftGroupScheduleRecord,
} from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

type GroupForm = {
  name: string
  code: string
  siteId: string
  leaderEmployeeId: string
  memberIds: string[]
}

type ScheduleForm = {
  siteId: string
  date: string
  shift: "DAY" | "NIGHT"
  shiftGroupId: string
  notes: string
}

export default function HrShiftGroupsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [activeView, setActiveView] = useState<"groups" | "schedules">("groups")
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false)
  const [siteFilter, setSiteFilter] = useState("all")
  const [groupsQuery, setGroupsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  })
  const [schedulesQuery, setSchedulesQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  })

  const [groupForm, setGroupForm] = useState<GroupForm>({
    name: "",
    code: "",
    siteId: "",
    leaderEmployeeId: "",
    memberIds: [],
  })
  const [leaderSearch, setLeaderSearch] = useState("")
  const [memberSearch, setMemberSearch] = useState("")

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    siteId: "",
    date: new Date().toISOString().slice(0, 10),
    shift: "DAY",
    shiftGroupId: "",
    notes: "",
  })

  const { data: sitesData, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })
  const sites = useMemo(() => sitesData ?? [], [sitesData])
  const activeSiteFilter = siteFilter === "all" ? undefined : siteFilter

  const { data: groupsData, isLoading: groupsLoading, error: groupsError } = useQuery({
    queryKey: ["shift-groups", groupsQuery.search, activeSiteFilter],
    queryFn: () =>
      fetchShiftGroups({
        search: groupsQuery.search?.trim() || undefined,
        siteId: activeSiteFilter,
        limit: 300,
      }),
  })
  const groups = useMemo(() => groupsData?.data ?? [], [groupsData])

  const { data: schedulesData, isLoading: schedulesLoading, error: schedulesError } = useQuery({
    queryKey: ["shift-group-schedules", schedulesQuery.search, activeSiteFilter],
    queryFn: () =>
      fetchShiftGroupSchedules({
        search: schedulesQuery.search?.trim() || undefined,
        siteId: activeSiteFilter,
        limit: 300,
      }),
  })
  const schedules = useMemo(() => schedulesData?.data ?? [], [schedulesData])

  const { data: leaderSearchData } = useQuery({
    queryKey: ["employees", "shift-group-leader-search", leaderSearch],
    queryFn: () => fetchEmployees({ active: true, search: leaderSearch.trim(), limit: 12 }),
    enabled: groupSheetOpen && leaderSearch.trim().length >= 2,
  })
  const leaderSearchResults = useMemo(() => leaderSearchData?.data ?? [], [leaderSearchData])

  const { data: memberSearchData } = useQuery({
    queryKey: ["employees", "shift-group-member-search", memberSearch],
    queryFn: () => fetchEmployees({ active: true, search: memberSearch.trim(), limit: 12 }),
    enabled: groupSheetOpen && memberSearch.trim().length >= 2,
  })
  const memberSearchResults = useMemo(() => memberSearchData?.data ?? [], [memberSearchData])

  const { data: scheduleGroupOptionsData } = useQuery({
    queryKey: ["shift-groups", "schedule-options", scheduleForm.siteId],
    queryFn: () => fetchShiftGroups({ siteId: scheduleForm.siteId, active: true, limit: 300 }),
    enabled: scheduleSheetOpen && Boolean(scheduleForm.siteId),
  })
  const scheduleGroupOptions = useMemo(
    () => scheduleGroupOptionsData?.data ?? [],
    [scheduleGroupOptionsData],
  )

  const createGroupMutation = useMutation({
    mutationFn: () =>
      createShiftGroup({
        name: groupForm.name.trim(),
        code: groupForm.code.trim() || undefined,
        siteId: groupForm.siteId,
        leaderEmployeeId: groupForm.leaderEmployeeId,
        memberIds: groupForm.memberIds,
      }),
    onSuccess: () => {
      toast({ title: "Shift group created", variant: "success" })
      setGroupSheetOpen(false)
      setGroupForm({
        name: "",
        code: "",
        siteId: "",
        leaderEmployeeId: "",
        memberIds: [],
      })
      setLeaderSearch("")
      setMemberSearch("")
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error) =>
      toast({
        title: "Unable to create shift group",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  })

  const archiveGroupMutation = useMutation({
    mutationFn: (id: string) => archiveShiftGroup(id),
    onSuccess: () => {
      toast({ title: "Shift group archived", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error) =>
      toast({
        title: "Unable to archive shift group",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  })

  const createScheduleMutation = useMutation({
    mutationFn: () =>
      createShiftGroupSchedule({
        siteId: scheduleForm.siteId,
        date: scheduleForm.date,
        shift: scheduleForm.shift,
        shiftGroupId: scheduleForm.shiftGroupId,
        notes: scheduleForm.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Shift schedule created", variant: "success" })
      setScheduleSheetOpen(false)
      setScheduleForm({
        siteId: "",
        date: new Date().toISOString().slice(0, 10),
        shift: "DAY",
        shiftGroupId: "",
        notes: "",
      })
      queryClient.invalidateQueries({ queryKey: ["shift-group-schedules"] })
    },
    onError: (error) =>
      toast({
        title: "Unable to create schedule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => deleteShiftGroupSchedule(id),
    onSuccess: () => {
      toast({ title: "Shift schedule deleted", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["shift-group-schedules"] })
    },
    onError: (error) =>
      toast({
        title: "Unable to delete schedule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  })

  const groupsColumns = useMemo<ColumnDef<ShiftGroupRecord>[]>(
    () => [
      {
        id: "name",
        header: "Group",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.code || "-"}</div>
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site?.name ?? "-",
      },
      {
        id: "leader",
        header: "Leader",
        cell: ({ row }) =>
          row.original.leader ? (
            <div>
              <div className="font-semibold">{row.original.leader.name}</div>
              <div className="text-xs text-muted-foreground">{row.original.leader.employeeId}</div>
            </div>
          ) : (
            "-"
          ),
      },
      {
        id: "members",
        header: "Members",
        cell: ({ row }) => <span className="font-mono">{row.original._count?.members ?? 0}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              disabled={!row.original.isActive || archiveGroupMutation.isPending}
              onClick={() => archiveGroupMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [archiveGroupMutation],
  )

  const schedulesColumns = useMemo<ColumnDef<ShiftGroupScheduleRecord>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => <span className="font-mono">{String(row.original.date).slice(0, 10)}</span>,
      },
      {
        id: "shift",
        header: "Shift",
        cell: ({ row }) => <span className="font-mono">{row.original.shift}</span>,
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site?.name ?? "-",
      },
      {
        id: "group",
        header: "Group",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.shiftGroup?.name ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.shiftGroup?.leader?.name ?? "-"}
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteScheduleMutation.isPending}
              onClick={() => deleteScheduleMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteScheduleMutation],
  )

  const loadError = sitesError || groupsError || schedulesError

  return (
    <HrShell
      activeTab="shift-groups"
      actions={
        activeView === "groups" ? (
          <Button
            size="sm"
            onClick={() => {
              setGroupForm((prev) => ({
                ...prev,
                siteId: siteFilter === "all" ? sites[0]?.id ?? "" : siteFilter,
              }))
              setGroupSheetOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            New Group
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              setScheduleForm((prev) => ({
                ...prev,
                siteId: siteFilter === "all" ? sites[0]?.id ?? "" : siteFilter,
              }))
              setScheduleSheetOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            New Schedule
          </Button>
        )
      }
      description="Create and schedule shift groups."
    >
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load shift group data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        railLabel="Shift setup"
        items={[
          { id: "groups", label: "Groups", count: groups.length },
          { id: "schedules", label: "Schedules", count: schedules.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "groups" | "schedules")}
      >
        {sitesLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : activeView === "groups" ? (
          <DataTable
            data={groups}
            columns={groupsColumns}
            queryState={groupsQuery}
            onQueryStateChange={(next) =>
              setGroupsQuery((prev) => ({ ...prev, ...next }))
            }
            searchPlaceholder="Search groups"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            toolbar={
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Filter site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            emptyState={groupsLoading ? "Loading groups..." : "No groups found."}
            pagination={{ enabled: true }}
          />
        ) : (
          <DataTable
            data={schedules}
            columns={schedulesColumns}
            queryState={schedulesQuery}
            onQueryStateChange={(next) =>
              setSchedulesQuery((prev) => ({ ...prev, ...next }))
            }
            searchPlaceholder="Search schedules"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            toolbar={
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Filter site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            emptyState={schedulesLoading ? "Loading schedules..." : "No schedules found."}
            pagination={{ enabled: true }}
          />
        )}
      </VerticalDataViews>

      <Sheet open={groupSheetOpen} onOpenChange={setGroupSheetOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Create Shift Group</SheetTitle>
            <SheetDescription>Group leader automatically acts as shift leader.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createGroupMutation.mutate()
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Name *</label>
              <Input
                value={groupForm.name}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Code</label>
              <Input
                value={groupForm.code}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Site *</label>
              <Select
                value={groupForm.siteId}
                onValueChange={(value) => setGroupForm((prev) => ({ ...prev, siteId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Leader search *</label>
              <Input
                value={leaderSearch}
                onChange={(event) => setLeaderSearch(event.target.value)}
                placeholder="Type worker name or ID"
              />
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">
                {leaderSearchResults.map((employee: EmployeeSummary) => (
                  <button
                    key={employee.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setGroupForm((prev) => ({
                        ...prev,
                        leaderEmployeeId: employee.id,
                        memberIds: Array.from(new Set([...prev.memberIds, employee.id])),
                      }))
                      setLeaderSearch("")
                    }}
                  >
                    <span>{employee.name}</span>
                    <span className="text-xs text-muted-foreground">{employee.employeeId}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Add members</label>
              <Input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Type worker name or ID"
              />
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">
                {memberSearchResults.map((employee: EmployeeSummary) => (
                  <button
                    key={employee.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setGroupForm((prev) => ({
                        ...prev,
                        memberIds: Array.from(new Set([...prev.memberIds, employee.id])),
                      }))
                      setMemberSearch("")
                    }}
                  >
                    <span>{employee.name}</span>
                    <span className="text-xs text-muted-foreground">{employee.employeeId}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createGroupMutation.isPending}>
              Create Group
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Create Schedule</SheetTitle>
            <SheetDescription>Assign one shift group to a site/date/shift.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createScheduleMutation.mutate()
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Site *</label>
              <Select
                value={scheduleForm.siteId}
                onValueChange={(value) =>
                  setScheduleForm((prev) => ({ ...prev, siteId: value, shiftGroupId: "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Date *</label>
                <Input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, date: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Shift *</label>
                <Select
                  value={scheduleForm.shift}
                  onValueChange={(value) => setScheduleForm((prev) => ({ ...prev, shift: value as "DAY" | "NIGHT" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day</SelectItem>
                    <SelectItem value="NIGHT">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Group *</label>
              <Select
                value={scheduleForm.shiftGroupId}
                onValueChange={(value) => setScheduleForm((prev) => ({ ...prev, shiftGroupId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {scheduleGroupOptions.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Notes</label>
              <Input
                value={scheduleForm.notes}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <Button type="submit" className="w-full" disabled={createScheduleMutation.isPending}>
              Create Schedule
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </HrShell>
  )
}
