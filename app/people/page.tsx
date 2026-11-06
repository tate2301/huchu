"use client";

import * as React from "react";
import Link from "next/link";
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
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PeopleShell } from "@/components/people/people-shell";
import { EmployeeDrawer, type EmployeeDrawerForm } from "@/components/people/employee-drawer";
import { EMPLOYMENT_TYPE_LABEL } from "@/components/records/people-directory";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchCompensationTemplates,
  fetchDepartments,
  fetchEmployees,
  fetchJobGrades,
  type EmployeeSummary,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  getEmployeePositionOptions,
} from "@/lib/platform/vertical-defaults";
import { resolveWorkspaceProfileForRoles } from "@/lib/platform/vertical-roles";

type StatusTab = "active" | "all" | "inactive";

export default function HumanResourcesPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<StatusTab>("active");
  const [search, setSearch] = React.useState("");
  const [departmentFilter, setDepartmentFilter] = React.useState<string | null>(null);
  const [employmentFilter, setEmploymentFilter] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<"name" | "hireDate">("name");
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingEmployee, setEditingEmployee] = React.useState<EmployeeSummary | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Load employees
  const employeesQuery = useQuery({
    queryKey: ["employees", search, tab],
    queryFn: () =>
      fetchEmployees({
        search,
        active: tab === "all" ? undefined : tab === "active",
        limit: 500,
      }),
  });

  const departmentsQuery = useQuery({
    queryKey: ["departments", "hr"],
    queryFn: () => fetchDepartments({ active: true, limit: 500 }),
  });

  const gradesQuery = useQuery({
    queryKey: ["job-grades", "hr"],
    queryFn: () => fetchJobGrades({ active: true, limit: 500 }),
  });

  const templatesQuery = useQuery({
    queryKey: ["compensation-templates", "hr"],
    queryFn: () => fetchCompensationTemplates({ active: true, limit: 500 }),
  });

  const enabledFeatures = React.useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures ?? [],
    [session]
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const normalizedProfile = React.useMemo(
    () => resolveWorkspaceProfileForRoles({ workspaceProfile, enabledFeatures }),
    [enabledFeatures, workspaceProfile]
  );

  const positionOptions = React.useMemo(
    () => getEmployeePositionOptions({ workspaceProfile: normalizedProfile, enabledFeatures }),
    [enabledFeatures, normalizedProfile]
  );

  const employees = React.useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data]);
  const departments = React.useMemo(() => departmentsQuery.data?.data ?? [], [departmentsQuery.data]);
  const grades = React.useMemo(() => gradesQuery.data?.data ?? [], [gradesQuery.data]);
  const templates = React.useMemo(() => templatesQuery.data?.data ?? [], [templatesQuery.data]);

  // Counts for tabs
  const activeCount = React.useMemo(() => employees.filter((e) => e.isActive).length, [employees]);
  const inactiveCount = React.useMemo(() => employees.filter((e) => !e.isActive).length, [employees]);
  const totalCount = employees.length;

  // Filter & sort
  const filteredEmployees = React.useMemo(() => {
    let list = [...employees];
    if (departmentFilter) {
      list = list.filter((e) => e.departmentId === departmentFilter);
    }
    if (employmentFilter) {
      list = list.filter((e) => e.employmentType === employmentFilter);
    }
    list.sort((a, b) => {
      if (sortKey === "hireDate") {
        return (b.hireDate ? new Date(b.hireDate).getTime() : 0) - (a.hireDate ? new Date(a.hireDate).getTime() : 0);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [employees, departmentFilter, employmentFilter, sortKey]);

  // Pagination
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredEmployees.length);
  const pagedEmployees = React.useMemo(
    () => filteredEmployees.slice((page - 1) * pageSize, page * pageSize),
    [filteredEmployees, page, pageSize]
  );

  // Selection
  const pagedIds = React.useMemo(() => pagedEmployees.map((e) => e.id), [pagedEmployees]);
  const selection = useSelection(pagedIds);
  const selectedRows = React.useMemo(
    () => pagedEmployees.filter((e) => selection.isSelected(e.id)),
    [pagedEmployees, selection]
  );

  // Mutations
  const createEmployeeMutation = useMutation({
    mutationFn: async (payload: EmployeeDrawerForm) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          departmentId: payload.departmentId || undefined,
          gradeId: payload.gradeId || undefined,
          supervisorId: payload.supervisorId || undefined,
          compensationTemplateId: payload.compensationTemplateId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Employee created", description: "Added to workforce and directory.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: EmployeeDrawerForm }) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...payload,
          departmentId: payload.departmentId || undefined,
          gradeId: payload.gradeId || undefined,
          supervisorId: payload.supervisorId || undefined,
          compensationTemplateId: payload.compensationTemplateId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Employee updated", description: "Changes saved.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      toast({ title: "Status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Employee deleted", variant: "success" });
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: "Unable to delete employee", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const handleSaveDrawer = async (saved: EmployeeDrawerForm, isEdit: boolean) => {
    if (isEdit && editingEmployee) {
      await updateEmployeeMutation.mutateAsync({ id: editingEmployee.id, payload: saved });
    } else {
      await createEmployeeMutation.mutateAsync(saved);
    }
  };

  const handleExportCsv = (rowsToExport: EmployeeSummary[]) => {
    const csv = [
      ["Employee ID", "Name", "Department", "Position", "Employment Type", "Phone", "National ID", "Status", "Hire Date"],
      ...rowsToExport.map((e) => [
        e.employeeId || "",
        e.name,
        e.department?.name || "",
        e.position || "",
        EMPLOYMENT_TYPE_LABEL[e.employmentType] || e.employmentType,
        e.phone || "",
        e.nationalIdNumber || "",
        e.isActive ? "Active" : "Inactive",
        e.hireDate ? String(e.hireDate).slice(0, 10) : "",
      ]),
    ];
    downloadCsv(`employees-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const selectedDepartmentName = React.useMemo(() => {
    if (!departmentFilter) return "Any";
    return departments.find((d) => d.id === departmentFilter)?.name ?? "Any";
  }, [departmentFilter, departments]);

  const selectedEmploymentName = React.useMemo(() => {
    if (!employmentFilter) return "Any";
    return EMPLOYMENT_TYPE_LABEL[employmentFilter as keyof typeof EMPLOYMENT_TYPE_LABEL] ?? "Any";
  }, [employmentFilter]);

  const employeePendingDelete = React.useMemo(
    () => employees.find((e) => e.id === deletingId) ?? null,
    [deletingId, employees]
  );

  return (
    <PeopleShell
      activeTab="employees"
      title="Staff Directory"
      actions={
        <Button
          variant="primary"
          icon="plus"
          shortcut="N"
          onClick={() => {
            setEditingEmployee(null);
            setDrawerOpen(true);
          }}
        >
          Add employee
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Employee views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "active", label: "Active", count: activeCount },
                { value: "all", label: "All staff", count: totalCount },
                { value: "inactive", label: "Inactive", count: inactiveCount },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search employees by name, role, email..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredEmployees.length} of ${totalCount}`}
              chips={
                <>
                  <BkChip
                    label="Department"
                    value={selectedDepartmentName}
                    set={Boolean(departmentFilter)}
                    items={[
                      {
                        key: "any-dept",
                        label: "Any department",
                        checked: !departmentFilter,
                        onSelect: () => {
                          setDepartmentFilter(null);
                          setPage(1);
                        },
                      },
                      { separator: true },
                      ...departments.map((d) => ({
                        key: d.id,
                        label: d.name,
                        checked: departmentFilter === d.id,
                        onSelect: () => {
                          setDepartmentFilter(d.id);
                          setPage(1);
                        },
                      })),
                    ]}
                  />

                  <BkChip
                    label="Employment"
                    value={selectedEmploymentName}
                    set={Boolean(employmentFilter)}
                    items={[
                      {
                        key: "any-type",
                        label: "Any employment",
                        checked: !employmentFilter,
                        onSelect: () => {
                          setEmploymentFilter(null);
                          setPage(1);
                        },
                      },
                      { separator: true },
                      ...(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"] as const).map((type) => ({
                        key: type,
                        label: EMPLOYMENT_TYPE_LABEL[type],
                        checked: employmentFilter === type,
                        onSelect: () => {
                          setEmploymentFilter(type);
                          setPage(1);
                        },
                      })),
                    ]}
                  />
                </>
              }
              end={
                <BkQuietTools
                  onSort={() => setSortKey((curr) => (curr === "name" ? "hireDate" : "name"))}
                  sortLabel={sortKey === "name" ? "By name" : "By hire date"}
                  onExport={() => handleExportCsv(filteredEmployees)}
                />
              }
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Employees"
              foot={
                <TableFoot
                  range={filteredEmployees.length === 0 ? "None" : `${from} to ${to} of ${filteredEmployees.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredEmployees.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selectedRows.length,
                    onClear: selection.clear,
                    actions: (
                      <>
                        <Button
                          icon="export"
                          onClick={() => handleExportCsv(selectedRows)}
                        >
                          Export selected
                        </Button>
                        <Button
                          onClick={async () => {
                            for (const row of selectedRows) {
                              await toggleStatusMutation.mutateAsync({ id: row.id, isActive: true });
                            }
                            selection.clear();
                          }}
                        >
                          Mark active
                        </Button>
                        <Button
                          onClick={async () => {
                            for (const row of selectedRows) {
                              await toggleStatusMutation.mutateAsync({ id: row.id, isActive: false });
                            }
                            selection.clear();
                          }}
                        >
                          Mark inactive
                        </Button>
                      </>
                    ),
                  }}
                />
              }
            >
              {filteredEmployees.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No employees match</b>
                  <p className="muted">
                    {search || departmentFilter || employmentFilter
                      ? "Clear the search or filter chips to see everyone."
                      : "Add your first member of staff with Add employee."}
                  </p>
                </div>
              ) : (
                <table className="table" aria-label="Employees">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 280 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 60 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all employees"
                      />
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Position / Role</th>
                      <th>Employment</th>
                      <th>Hire date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEmployees.map((emp) => {
                      const isSelected = selection.isSelected(emp.id);
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "edit",
                          label: "Edit details",
                          icon: "pencil",
                          onSelect: () => {
                            setEditingEmployee(emp);
                            setDrawerOpen(true);
                          },
                        },
                        {
                          key: "profile",
                          label: "Open profile",
                          icon: "person",
                          onSelect: () => {
                            window.location.assign(`/people/${emp.id}`);
                          },
                        },
                        { separator: true },
                        {
                          key: "toggle-status",
                          label: emp.isActive ? "Mark inactive" : "Mark active",
                          onSelect: () => {
                            toggleStatusMutation.mutate({ id: emp.id, isActive: !emp.isActive });
                          },
                        },
                        {
                          key: "delete",
                          label: "Delete employee",
                          icon: "bin",
                          danger: true,
                          onSelect: () => setDeletingId(emp.id),
                        },
                      ];

                      return (
                        <tr key={emp.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(emp.id)}
                            label={`Select ${emp.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={emp.name} src={emp.passportPhotoUrl || undefined} />
                              <div>
                                <Link
                                  href={`/people/${emp.id}`}
                                  style={{ fontWeight: 500, color: "var(--color-ink)" }}
                                >
                                  {emp.name}
                                </Link>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {emp.employeeId ? `${emp.employeeId} • ` : ""}
                                  {emp.phone || emp.nationalIdNumber || "No contact"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{emp.department?.name ?? <span className="muted">—</span>}</td>
                          <td>
                            {positionOptions.find((p) => p.value === emp.position)?.label || emp.position || (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>{EMPLOYMENT_TYPE_LABEL[emp.employmentType] || emp.employmentType}</td>
                          <td className="num">
                            {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("en-GB") : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <BkState tone={emp.isActive ? "success" : "plain"}>
                              {emp.isActive ? "Active" : "Inactive"}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <MenuButton label="More" items={moreEntries}>
                              •••
                            </MenuButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED EMPLOYEE DRAWER */}
            <EmployeeDrawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              employee={editingEmployee}
              departments={departments}
              grades={grades}
              templates={templates}
              supervisors={employees}
              positionOptions={positionOptions}
              onSaved={handleSaveDrawer}
            />

            {/* DELETE CONFIRM DIALOG */}
            <Dialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete employee record</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove <b>{employeePendingDelete?.name}</b> from the team?
                    This will remove their workforce placement and salary assignments.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button onClick={() => setDeletingId(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    busy={deleteEmployeeMutation.isPending}
                    onClick={() => deletingId && deleteEmployeeMutation.mutate(deletingId)}
                  >
                    Delete record
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
