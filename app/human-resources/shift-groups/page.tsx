"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, Plus, Trash2 } from "@/lib/icons"

import { EmployeeAvatar } from "@/components/shared/employee-avatar"
import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

type GroupEmployeePreview = {
  id: string
  name: string
  employeeId: string
  passportPhotoUrl?: string | null
}

type ScheduleForm = {
  siteId: string
  date: string
  shift: string
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
  const [selectedEmployees, setSelectedEmployees] = useState<Record<string, GroupEmployeePreview>>({})
  const [leaderSearch, setLeaderSearch] = useState("")
  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState("")
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    siteId: "",
    date: new Date().toISOString().slice(0, 10),
    shift: "SHIFT-1",
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
    enabled: groupSheetOpen && leaderSearch.trim().length >= 1,
  })
  const leaderSearchResults = useMemo(() => leaderSearchData?.data ?? [], [leaderSearchData])

  const { data: memberSearchData } = useQuery({
    queryKey: ["employees", "shift-group-member-search", memberSearch],
    queryFn: () => fetchEmployees({ active: true, search: memberSearch.trim(), limit: 12 }),
    enabled: groupSheetOpen && memberSearch.trim().length >= 1,
  })
  const memberSearchResults = useMemo(() => memberSearchData?.data ?? [], [memberSearchData])

  const selectedLeaderPreview = groupForm.leaderEmployeeId
    ? selectedEmployees[groupForm.leaderEmployeeId] ?? null
    : null
  const selectedMembersPreview = useMemo(
    () =>
      groupForm.memberIds
        .map((memberId) => selectedEmployees[memberId])
        .filter((member): member is GroupEmployeePreview => Boolean(member))
        .sort((a, b) => {
          if (a.id === groupForm.leaderEmployeeId) return -1
          if (b.id === groupForm.leaderEmployeeId) return 1
          return a.name.localeCompare(b.name)
        }),
    [groupForm.memberIds, groupForm.leaderEmployeeId, selectedEmployees],
  )

  const cacheEmployeePreview = (employee: EmployeeSummary) => {
    setSelectedEmployees((prev) => ({
      ...prev,
      [employee.id]: {
        id: employee.id,
        name: employee.name,
        employeeId: employee.employeeId,
        passportPhotoUrl: employee.passportPhotoUrl,
      },
    }))
  }

  const handleLeaderSelect = (employee: EmployeeSummary) => {
    cacheEmployeePreview(employee)
    setGroupForm((prev) => ({
      ...prev,
      leaderEmployeeId: employee.id,
      memberIds: Array.from(new Set([...prev.memberIds, employee.id])),
    }))
    setLeaderSearch("")
    setLeaderPickerOpen(false)
  }

  const handleMemberSelect = (employee: EmployeeSummary) => {
    cacheEmployeePreview(employee)
    setGroupForm((prev) => ({
      ...prev,
      memberIds: Array.from(new Set([...prev.memberIds, employee.id])),
    }))
    setMemberSearch("")
    setMemberPickerOpen(false)
  }

  const removeMember = (employeeId: string) => {
    if (employeeId === groupForm.leaderEmployeeId) return
    setGroupForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.filter((memberId) => memberId !== employeeId),
    }))
  }

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
      setSelectedEmployees({})
      setLeaderSearch("")
      setMemberSearch("")
      setLeaderPickerOpen(false)
      setMemberPickerOpen(false)
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
        shift: "SHIFT-1",
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
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "leader",
        header: "Leader",
        cell: ({ row }) =>
          row.original.leader ? (
            <div className="flex items-center gap-2">
              <EmployeeAvatar name={row.original.leader.name} size="sm" />
              <div>
                <div className="font-semibold">{row.original.leader.name}</div>
                <div className="text-xs text-muted-foreground">{row.original.leader.employeeId}</div>
              </div>
            </div>
          ) : (
            "-"
          ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "members",
        header: "Members",
        cell: ({ row }) => <span className="font-mono">{row.original._count?.members ?? 0}</span>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
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
        size: 108,
        minSize: 108,
        maxSize: 108},
    ],
    [archiveGroupMutation],
  )

  const schedulesColumns = useMemo<ColumnDef<ShiftGroupScheduleRecord>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => <span className="font-mono">{String(row.original.date).slice(0, 10)}</span>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "shift",
        header: "Shift",
        cell: ({ row }) => <span className="font-mono">{row.original.shift}</span>,
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "group",
        header: "Group",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-semibold">{row.original.shiftGroup?.name ?? "-"}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {row.original.shiftGroup?.leader?.name ? (
                <EmployeeAvatar name={row.original.shiftGroup.leader.name} size="sm" />
              ) : null}
              {row.original.shiftGroup?.leader?.name ?? "-"}
            </div>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
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
        size: 108,
        minSize: 108,
        maxSize: 108},
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
              setGroupForm({
                name: "",
                code: "",
                siteId: siteFilter === "all" ? sites[0]?.id ?? "" : siteFilter,
                leaderEmployeeId: "",
                memberIds: [],
              })
              setSelectedEmployees({})
              setLeaderSearch("")
              setMemberSearch("")
              setLeaderPickerOpen(false)
              setMemberPickerOpen(false)
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

      <Sheet
        open={groupSheetOpen}
        onOpenChange={(open) => {
          setGroupSheetOpen(open)
          if (!open) {
            setLeaderPickerOpen(false)
            setMemberPickerOpen(false)
            setLeaderSearch("")
            setMemberSearch("")
          }
        }}
      >
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
              <label className="mb-2 block text-sm font-semibold">Group leader *</label>
              <Popover open={leaderPickerOpen} onOpenChange={setLeaderPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between">
                    <span className="truncate">
                      {selectedLeaderPreview ? selectedLeaderPreview.name : "Search worker by name or ID"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      value={leaderSearch}
                      onValueChange={setLeaderSearch}
                      placeholder="Type worker name or ID..."
                    />
                    <CommandList>
                      <CommandEmpty>
                        {leaderSearch.trim().length === 0 ? "Type a worker name or ID." : "No workers found."}
                      </CommandEmpty>
                      {leaderSearchResults.length > 0 ? (
                        <CommandGroup>
                          {leaderSearchResults.map((employee) => (
                            <CommandItem
                              key={employee.id}
                              value={`${employee.name} ${employee.employeeId}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onSelect={() => handleLeaderSelect(employee)}
                            >
                              <EmployeeAvatar
                                name={employee.name}
                                photoUrl={employee.passportPhotoUrl}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{employee.name}</div>
                                <div className="text-xs text-muted-foreground">{employee.employeeId}</div>
                              </div>
                              {groupForm.leaderEmployeeId === employee.id ? (
                                <CheckIcon className="h-4 w-4 text-primary" />
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Add members</label>
              <Popover open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between">
                    <span className="truncate">Search worker by name or ID</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      value={memberSearch}
                      onValueChange={setMemberSearch}
                      placeholder="Type worker name or ID..."
                    />
                    <CommandList>
                      <CommandEmpty>
                        {memberSearch.trim().length === 0 ? "Type a worker name or ID." : "No workers found."}
                      </CommandEmpty>
                      {memberSearchResults.length > 0 ? (
                        <CommandGroup>
                          {memberSearchResults.map((employee) => (
                            <CommandItem
                              key={employee.id}
                              value={`${employee.name} ${employee.employeeId}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onSelect={() => handleMemberSelect(employee)}
                            >
                              <EmployeeAvatar
                                name={employee.name}
                                photoUrl={employee.passportPhotoUrl}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{employee.name}</div>
                                <div className="text-xs text-muted-foreground">{employee.employeeId}</div>
                              </div>
                              {groupForm.memberIds.includes(employee.id) ? (
                                <CheckIcon className="h-4 w-4 text-primary" />
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Selected people preview</label>
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                {selectedMembersPreview.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Select a leader and members to preview the shift group roster.
                  </p>
                ) : (
                  selectedMembersPreview.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <EmployeeAvatar
                          name={member.name}
                          photoUrl={member.passportPhotoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{member.name}</div>
                          <div className="text-xs text-muted-foreground">{member.employeeId}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.id === groupForm.leaderEmployeeId ? "default" : "secondary"}>
                          {member.id === groupForm.leaderEmployeeId ? "Leader" : "Member"}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMember(member.id)}
                          disabled={member.id === groupForm.leaderEmployeeId}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={
                createGroupMutation.isPending ||
                !groupForm.name.trim() ||
                !groupForm.siteId ||
                !groupForm.leaderEmployeeId
              }
            >
              Create Group
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Create Schedule</SheetTitle>
            <SheetDescription>Assign a shift group to a site/date with any shift label.</SheetDescription>
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
                <Input
                  value={scheduleForm.shift}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({ ...prev, shift: event.target.value }))
                  }
                  placeholder="e.g. SHIFT-1, SHIFT-2, SHIFT-3"
                  required
                />
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
