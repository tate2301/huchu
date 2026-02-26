"use client"

import { useCallback, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ChevronDown, Pencil, Plus, Trash2 } from "@/lib/icons"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  createShiftGroup,
  createShiftGroupSchedule,
  deleteShiftGroupSchedule,
  fetchEmployees,
  fetchShiftGroup,
  fetchShiftGroups,
  fetchShiftGroupSchedules,
  fetchSites,
  permanentlyDeleteShiftGroup,
  updateShiftGroup,
  type EmployeeSummary,
  type ShiftGroupRecord,
  type ShiftGroupMemberRecord,
  type ShiftGroupScheduleRecord,
} from "@/lib/api"
import { ApiError, getApiErrorMessage } from "@/lib/api-client"

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

type FormFeedback = {
  message: string
  issues: string[]
}

function resolveShiftGroupFormFeedback(error: unknown): FormFeedback {
  const fallback = getApiErrorMessage(error)
  if (!(error instanceof ApiError)) {
    return { message: fallback, issues: [] }
  }

  const payload =
    error.details && typeof error.details === "object"
      ? (error.details as { details?: unknown })
      : undefined
  const details = payload?.details

  if (!Array.isArray(details)) {
    return { message: fallback, issues: [] }
  }

  const issues = details
    .map((entry) => (entry && typeof entry === "object" ? entry as Record<string, unknown> : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      if (typeof entry.message === "string") {
        const path = Array.isArray(entry.path)
          ? entry.path.filter((value): value is string => typeof value === "string").join(".")
          : ""
        return path ? `${path}: ${entry.message}` : entry.message
      }
      if (typeof entry.employeeName === "string" && typeof entry.groupName === "string") {
        const employeeCode =
          typeof entry.employeeCode === "string" && entry.employeeCode.trim().length > 0
            ? ` (${entry.employeeCode})`
            : ""
        return `${entry.employeeName}${employeeCode} -> ${entry.groupName}`
      }
      return null
    })
    .filter((entry): entry is string => Boolean(entry))

  return { message: fallback, issues }
}

function buildGroupFormFromRecord(
  group: ShiftGroupRecord & {
    members: ShiftGroupMemberRecord[]
  },
) {
  const memberIds = Array.from(
    new Set([...group.members.map((membership) => membership.employeeId), group.leaderEmployeeId]),
  )

  const selectedEmployeeMap: Record<string, GroupEmployeePreview> = {}
  for (const membership of group.members) {
    selectedEmployeeMap[membership.employee.id] = {
      id: membership.employee.id,
      name: membership.employee.name,
      employeeId: membership.employee.employeeId,
    }
  }
  if (group.leader) {
    selectedEmployeeMap[group.leader.id] = {
      id: group.leader.id,
      name: group.leader.name,
      employeeId: group.leader.employeeId,
    }
  }

  return {
    form: {
      name: group.name,
      code: group.code ?? "",
      siteId: group.siteId,
      leaderEmployeeId: group.leaderEmployeeId,
      memberIds,
    },
    selectedEmployeeMap,
  }
}

export default function HrShiftGroupsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [activeView, setActiveView] = useState<"groups" | "schedules">("groups")
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [groupSheetLoading, setGroupSheetLoading] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
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
  const [groupFormFeedback, setGroupFormFeedback] = useState<FormFeedback | null>(null)

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    siteId: "",
    date: new Date().toISOString().slice(0, 10),
    shift: "SHIFT-1",
    shiftGroupId: "",
    notes: "",
  })

  const resetGroupComposerState = useCallback((siteId = "") => {
    setEditingGroupId(null)
    setGroupFormFeedback(null)
    setGroupForm({
      name: "",
      code: "",
      siteId,
      leaderEmployeeId: "",
      memberIds: [],
    })
    setSelectedEmployees({})
    setLeaderSearch("")
    setMemberSearch("")
    setLeaderPickerOpen(false)
    setMemberPickerOpen(false)
  }, [])

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
    setGroupFormFeedback(null)
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
    setGroupFormFeedback(null)
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
    setGroupFormFeedback(null)
    setGroupForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.filter((memberId) => memberId !== employeeId),
    }))
  }

  const openCreateGroupSheet = useCallback(() => {
    const defaultSiteId = siteFilter === "all" ? sites[0]?.id ?? "" : siteFilter
    resetGroupComposerState(defaultSiteId)
    setGroupSheetOpen(true)
  }, [resetGroupComposerState, siteFilter, sites])

  const openEditGroupSheet = useCallback(
    async (groupId: string) => {
      setGroupSheetLoading(true)
      try {
        const group = await fetchShiftGroup(groupId)
        const { form, selectedEmployeeMap } = buildGroupFormFromRecord(group)
        setGroupFormFeedback(null)
        setEditingGroupId(group.id)
        setGroupForm(form)
        setSelectedEmployees(selectedEmployeeMap)
        setLeaderSearch("")
        setMemberSearch("")
        setLeaderPickerOpen(false)
        setMemberPickerOpen(false)
        setGroupSheetOpen(true)
      } catch (error) {
        toast({
          title: "Unable to load shift group",
          description: getApiErrorMessage(error),
          variant: "destructive",
        })
      } finally {
        setGroupSheetLoading(false)
      }
    },
    [toast],
  )

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
        memberIds: Array.from(new Set([...groupForm.memberIds, groupForm.leaderEmployeeId])),
      }),
    onMutate: () => {
      setGroupFormFeedback(null)
    },
    onSuccess: () => {
      toast({ title: "Shift group created", variant: "success" })
      setGroupSheetOpen(false)
      resetGroupComposerState()
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error) => {
      setGroupFormFeedback(resolveShiftGroupFormFeedback(error))
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: () => {
      if (!editingGroupId) {
        throw new Error("No shift group selected for update")
      }
      return updateShiftGroup(editingGroupId, {
        name: groupForm.name.trim(),
        code: groupForm.code.trim() || null,
        siteId: groupForm.siteId,
        leaderEmployeeId: groupForm.leaderEmployeeId,
        memberIds: Array.from(new Set([...groupForm.memberIds, groupForm.leaderEmployeeId])),
      })
    },
    onMutate: () => {
      setGroupFormFeedback(null)
    },
    onSuccess: () => {
      toast({ title: "Shift group updated", variant: "success" })
      setGroupSheetOpen(false)
      resetGroupComposerState()
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error) => {
      setGroupFormFeedback(resolveShiftGroupFormFeedback(error))
    },
  })

  const setGroupStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateShiftGroup(id, { isActive }),
    onSuccess: (_data, variables) => {
      toast({
        title: variables.isActive ? "Shift group re-enabled" : "Shift group disabled",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error, variables) =>
      toast({
        title: variables.isActive ? "Unable to re-enable shift group" : "Unable to disable shift group",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  })

  const permanentlyDeleteGroupMutation = useMutation({
    mutationFn: (id: string) => permanentlyDeleteShiftGroup(id),
    onSuccess: () => {
      toast({ title: "Shift group permanently deleted", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] })
    },
    onError: (error) =>
      toast({
        title: "Unable to permanently delete shift group",
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

  const handleSetGroupStatus = useCallback(
    (group: ShiftGroupRecord, isActive: boolean) => {
      const actionLabel = isActive ? "re-enable" : "disable"
      const confirmed = window.confirm(
        `Are you sure you want to ${actionLabel} "${group.name}"?`,
      )
      if (!confirmed) return
      setGroupStatusMutation.mutate({ id: group.id, isActive })
    },
    [setGroupStatusMutation],
  )

  const handlePermanentlyDeleteGroup = useCallback(
    (group: ShiftGroupRecord) => {
      const confirmed = window.confirm(
        `Permanently delete "${group.name}"? This cannot be undone.`,
      )
      if (!confirmed) return
      permanentlyDeleteGroupMutation.mutate(group.id)
    },
    [permanentlyDeleteGroupMutation],
  )

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    groupSheetLoading ||
                    updateGroupMutation.isPending ||
                    createGroupMutation.isPending ||
                    setGroupStatusMutation.isPending ||
                    permanentlyDeleteGroupMutation.isPending
                  }
                >
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void openEditGroupSheet(row.original.id)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleSetGroupStatus(row.original, true)}
                  disabled={row.original.isActive}
                >
                  Re-enable
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSetGroupStatus(row.original, false)}
                  disabled={!row.original.isActive}
                >
                  Disable
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handlePermanentlyDeleteGroup(row.original)}
                >
                  <Trash2 className="h-4 w-4" />
                  Permanently delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 176,
        minSize: 176,
        maxSize: 176},
    ],
    [
      createGroupMutation.isPending,
      handlePermanentlyDeleteGroup,
      handleSetGroupStatus,
      groupSheetLoading,
      openEditGroupSheet,
      permanentlyDeleteGroupMutation.isPending,
      setGroupStatusMutation.isPending,
      updateGroupMutation.isPending,
    ],
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
            onClick={openCreateGroupSheet}
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
                <SelectTrigger className="h-8 w-full sm:w-[200px]">
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
                <SelectTrigger className="h-8 w-full sm:w-[200px]">
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
            resetGroupComposerState()
          }
        }}
      >
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>{editingGroupId ? "Edit Shift Group" : "Create Shift Group"}</SheetTitle>
            <SheetDescription>
              {editingGroupId
                ? "Update group details, leader, and member roster."
                : "Group leader automatically acts as shift leader."}
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (editingGroupId) {
                updateGroupMutation.mutate()
                return
              }
              createGroupMutation.mutate()
            }}
          >
            {groupFormFeedback ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to save shift group</AlertTitle>
                <AlertDescription>
                  <p>{groupFormFeedback.message}</p>
                  {groupFormFeedback.issues.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs">
                      {groupFormFeedback.issues.slice(0, 4).map((issue, index) => (
                        <p key={`${issue}-${index}`}>- {issue}</p>
                      ))}
                      {groupFormFeedback.issues.length > 4 ? (
                        <p>- +{groupFormFeedback.issues.length - 4} more issue(s)</p>
                      ) : null}
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-semibold">Name *</label>
              <Input
                value={groupForm.name}
                onChange={(event) => {
                  setGroupFormFeedback(null)
                  setGroupForm((prev) => ({ ...prev, name: event.target.value }))
                }}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Code</label>
              <Input
                value={groupForm.code}
                onChange={(event) => {
                  setGroupFormFeedback(null)
                  setGroupForm((prev) => ({ ...prev, code: event.target.value }))
                }}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Site *</label>
              <Select
                value={groupForm.siteId}
                onValueChange={(value) => {
                  setGroupFormFeedback(null)
                  setGroupForm((prev) => ({ ...prev, siteId: value }))
                }}
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
                groupSheetLoading ||
                createGroupMutation.isPending ||
                updateGroupMutation.isPending ||
                !groupForm.name.trim() ||
                !groupForm.siteId ||
                !groupForm.leaderEmployeeId
              }
            >
              {editingGroupId ? "Save Changes" : "Create Group"}
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
