"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
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
import {
  Button,
  Person,
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
  const userRole = (session?.user as { role?: string } | undefined)?.role;

  const positionOptions = React.useMemo(() => {
    const profile = resolveWorkspaceProfileForRoles({
      enabledFeatures,
      userRole,
    });
    return getEmployeePositionOptions(profile);
  }, [enabledFeatures, userRole]);

  const employees = React.useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data]
  );
  const departments = React.useMemo(
    () => departmentsQuery.data?.data ?? [],
    [departmentsQuery.data]
  );

  // Filtering
  const filtered = React.useMemo(() => {
    return employees.filter((emp) => {
      if (departmentFilter && emp.department?.id !== departmentFilter) return false;
      if (employmentFilter && emp.employmentType !== employmentFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const num = (emp.employeeNumber || "").toLowerCase();
      const pos = (emp.position || "").toLowerCase();
      const dept = (emp.department?.name || "").toLowerCase();
      return name.includes(q) || num.includes(q) || pos.includes(q) || dept.includes(q);
    });
  }, [employees, departmentFilter, employmentFilter, search]);

  // Tab counts
  const counts = React.useMemo(() => {
    const active = employees.filter((e) => e.isActive).length;
    const inactive = employees.filter((e) => !e.isActive).length;
    return {
      active,
      inactive,
      all: employees.length,
    };
  }, [employees]);

  // Pagination
  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Multi-select
  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (values: EmployeeDrawerForm) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Employee added successfully" });
      setDrawerOpen(false);
      setEditingEmployee(null);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EmployeeDrawerForm }) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Employee updated" });
      setDrawerOpen(false);
      setEditingEmployee(null);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Employee deleted" });
      setDeletingId(null);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const selectedRows = React.useMemo(
    () => pageRows.filter((r) => selection.isSelected(r.id)),
    [pageRows, selection]
  );

  const handleExportSelected = () => {
    const targets = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "staff-directory.csv",
      ["Employee No", "First Name", "Last Name", "Department", "Position", "Type", "Status", "Hire Date"],
      targets.map((e) => [
        e.employeeNumber || "",
        e.firstName,
        e.lastName,
        e.department?.name || "",
        e.position || "",
        EMPLOYMENT_TYPE_LABEL[e.employmentType] || e.employmentType,
        e.isActive ? "Active" : "Inactive",
        e.hireDate || "",
      ])
    );
  };

  const departmentName = React.useMemo(
    () => departments.find((d) => d.id === departmentFilter)?.name ?? "Any",
    [departments, departmentFilter]
  );

  const columns: Array<WsColumn<EmployeeSummary>> = [
    {
      key: "name",
      head: "Staff member",
      cell: (emp) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Person name={`${emp.firstName} ${emp.lastName}`} size={28} />
          <span>
            <span className="who" style={{ display: "block", fontWeight: 500 }}>
              {emp.firstName} {emp.lastName}
            </span>
            <span className="muted mono" style={{ fontSize: 11 }}>
              {emp.employeeNumber || "—"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "department",
      head: "Department",
      className: "muted",
      cell: (emp) => emp.department?.name || <None />,
    },
    {
      key: "position",
      head: "Position",
      cell: (emp) => emp.position || <None />,
    },
    {
      key: "status",
      head: "Status",
      cell: (emp) => (
        <St tone={emp.isActive ? "done" : "void"}>
          {emp.isActive ? "Active" : "Inactive"}
        </St>
      ),
    },
    {
      key: "type",
      head: "Employment",
      className: "muted",
      cell: (emp) => EMPLOYMENT_TYPE_LABEL[emp.employmentType] || emp.employmentType,
    },
    {
      key: "hired",
      head: "Hired",
      className: "muted mono",
      cell: (emp) => emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("en-GB") : <None />,
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (emp) => {
        const items: MenuEntry[] = [
          {
            key: "edit",
            label: "Edit employee profile",
            icon: "edit",
            onSelect: () => {
              setEditingEmployee(emp);
              setDrawerOpen(true);
            },
          },
          {
            key: "delete",
            label: "Delete record",
            icon: "trash",
            tone: "danger",
            onSelect: () => setDeletingId(emp.id),
          },
        ];
        return <MenuButton items={items} label="Actions" />;
      },
    },
  ];

  const totals = [
    `${totalRows} staff`,
    null,
    null,
    `${counts.active} active`,
    null,
    null,
    null,
  ];

  return (
    <PeopleShell
      activeTab="directory"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => {
            setEditingEmployee(null);
            setDrawerOpen(true);
          }}
        >
          New employee
        </Button>
      }
    >
      <BkPage screen="people" scroll={false}>
        <BkFinding
          fact={`${counts.active} active employees across ${departments.length} departments.`}
          rest="Select any row to view, update compensation, or adjust employment details."
        />

        <BkTabs
          label="Staff views"
          value={tab}
          onChange={(v) => {
            setTab(v as StatusTab);
            setPage(1);
          }}
          items={[
            { value: "active", label: "Active staff", count: counts.active },
            { value: "all", label: "All records", count: counts.all },
            { value: "inactive", label: "Inactive / Departed", count: counts.inactive },
          ]}
        />

        {selection.selected.size > 0 ? (
          <BkSelectionBar
            selection={{
              count: selection.selected.size,
              clear: selection.clear,
            }}
            actions={
              <Button variant="quiet" icon="export" onClick={handleExportSelected}>
                Export selected ({selection.selected.size})
              </Button>
            }
          />
        ) : (
          <BkTools
            find="Search staff by name, number, or position..."
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            filters={
              <>
                <BkFilter
                  label="Department"
                  value={departmentName}
                  items={[
                    {
                      key: "any",
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
                <BkFilter
                  label="Employment"
                  value={
                    employmentFilter
                      ? EMPLOYMENT_TYPE_LABEL[employmentFilter] || employmentFilter
                      : "Any"
                  }
                  items={[
                    {
                      key: "any",
                      label: "Any type",
                      checked: !employmentFilter,
                      onSelect: () => {
                        setEmploymentFilter(null);
                        setPage(1);
                      },
                    },
                    { separator: true },
                    {
                      key: "FULL_TIME",
                      label: "Full-time",
                      checked: employmentFilter === "FULL_TIME",
                      onSelect: () => {
                        setEmploymentFilter("FULL_TIME");
                        setPage(1);
                      },
                    },
                    {
                      key: "PART_TIME",
                      label: "Part-time",
                      checked: employmentFilter === "PART_TIME",
                      onSelect: () => {
                        setEmploymentFilter("PART_TIME");
                        setPage(1);
                      },
                    },
                    {
                      key: "CONTRACT",
                      label: "Contract",
                      checked: employmentFilter === "CONTRACT",
                      onSelect: () => {
                        setEmploymentFilter("CONTRACT");
                        setPage(1);
                      },
                    },
                    {
                      key: "CASUAL",
                      label: "Casual",
                      checked: employmentFilter === "CASUAL",
                      onSelect: () => {
                        setEmploymentFilter("CASUAL");
                        setPage(1);
                      },
                    },
                  ]}
                />
              </>
            }
            end={<BkQuietTools onExport={handleExportSelected} />}
          />
        )}

        <BkScroll>
          <Worksheet
            label="employees"
            rows={pageRows}
            rowKey={(emp) => emp.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (emp) => `${emp.firstName} ${emp.lastName}`,
            }}
            onOpen={(emp) => {
              setEditingEmployee(emp);
              setDrawerOpen(true);
            }}
            totals={totals}
            empty={
              employeesQuery.isLoading ? (
                "Loading directory..."
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No staff members match the criteria.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Try clearing filters or search query, or onboard a new employee.
                  </p>
                </div>
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
      </BkPage>

      {/* Guided Slideout Employee Drawer */}
      <EmployeeDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingEmployee(null);
        }}
        initialData={
          editingEmployee
            ? {
                firstName: editingEmployee.firstName,
                lastName: editingEmployee.lastName,
                email: editingEmployee.email ?? "",
                phone: editingEmployee.phone ?? "",
                departmentId: editingEmployee.department?.id ?? "",
                position: editingEmployee.position ?? "",
                employmentType: editingEmployee.employmentType,
                hireDate: editingEmployee.hireDate ?? "",
                nationalId: editingEmployee.nationalId ?? "",
                compensation: editingEmployee.compensation
                  ? {
                      currency: editingEmployee.compensation.currency,
                      baseSalary: Number(editingEmployee.compensation.baseSalary),
                    }
                  : undefined,
              }
            : undefined
        }
        departments={departments}
        positionOptions={positionOptions}
        jobGrades={gradesQuery.data?.data ?? []}
        compensationTemplates={templatesQuery.data?.data ?? []}
        onSubmit={(values) => {
          if (editingEmployee) {
            updateMutation.mutate({ id: editingEmployee.id, values });
          } else {
            createMutation.mutate(values);
          }
        }}
        submitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deletingId)} onOpenChange={() => setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete employee record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this employee? This action removes their access,
              attendance history, and payroll records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="quiet" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PeopleShell>
  );
}
