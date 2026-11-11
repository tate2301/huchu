"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type StatusTab = "active" | "all" | "inactive";

function HumanResourcesContent() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tab = (searchParams.get("tab") as StatusTab) || "active";
  const search = searchParams.get("q") || "";
  const departmentFilter = searchParams.get("dept") || null;
  const employmentFilter = searchParams.get("type") || null;
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 25;

  const onQuery = React.useCallback(
    (next: {
      tab?: string;
      q?: string;
      dept?: string | null;
      type?: string | null;
      page?: number;
    }) => {
      const merged = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty =
          value === null ||
          value === undefined ||
          value === "" ||
          (key === "tab" && value === "active") ||
          (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const setTab = (nextTab: StatusTab) => onQuery({ tab: nextTab, page: 1 });
  const setSearch = (nextQ: string) => onQuery({ q: nextQ, page: 1 });
  const setDepartmentFilter = (nextDept: string | null) =>
    onQuery({ dept: nextDept, page: 1 });
  const setEmploymentFilter = (nextType: string | null) =>
    onQuery({ type: nextType, page: 1 });
  const setPage = (nextPage: number) => onQuery({ page: nextPage });

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

  const positionOptions = React.useMemo(() => {
    return getEmployeePositionOptions({
      workspaceProfile,
      enabledFeatures,
    });
  }, [workspaceProfile, enabledFeatures]);

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
      const name = (emp.name || "").toLowerCase();
      const num = (emp.employeeId || "").toLowerCase();
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
      ["Employee ID", "Name", "Department", "Position", "Type", "Status", "Hire Date"],
      targets.map((e) => [
        e.employeeId || "",
        e.name,
        e.department?.name || "",
        e.position || "",
        (e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] || e.employmentType : ""),
        e.isActive ? "Active" : "Inactive",
        e.hireDate || "",
      ])
    );
  };

  const handleBulkStatus = async (isActive: boolean) => {
    try {
      await Promise.all(
        Array.from(selection.selected).map((id) =>
          fetchJson(`/api/employees/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ isActive }),
          })
        )
      );
      toast({
        title: `Updated ${selection.selected.size} staff member${selection.selected.size > 1 ? "s" : ""} to ${isActive ? "active" : "inactive"}`,
      });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
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
          <Person name={emp.name} size={28} />
          <span>
            <span className="who" style={{ display: "block", fontWeight: 500 }}>
              {emp.name}
            </span>
            <span className="muted mono" style={{ fontSize: 11 }}>
              {emp.employeeId || "—"}
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
      cell: (emp) => (emp.employmentType ? EMPLOYMENT_TYPE_LABEL[emp.employmentType] || emp.employmentType : <None />),
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
            icon: "retire",
            danger: true,
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
      activeTab="employees"
      primary={{
        label: "New employee",
        icon: "plus",
        shortcut: "N",
        onClick: () => {
          setEditingEmployee(null);
          setDrawerOpen(true);
        },
      }}
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
            { value: "active", label: "Active staff", count: counts.active, icon: "users" },
            { value: "all", label: "All records", count: counts.all, icon: "list" },
            { value: "inactive", label: "Inactive / Departed", count: counts.inactive, icon: "retire" },
          ]}
        />

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
              labelOf: (emp) => emp.name,
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

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
        >
          <Button icon="export" onClick={handleExportSelected}>
            Export ({selection.selected.size})
          </Button>
          <Button
            icon="done"
            onClick={() => void handleBulkStatus(true)}
          >
            Mark Active
          </Button>
          <Button
            icon="retire"
            onClick={() => void handleBulkStatus(false)}
          >
            Mark Inactive
          </Button>
        </BkSelectionBar>
      </BkPage>

      {/* Guided Slideout Employee Drawer */}
      <EmployeeDrawer
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (!v) setEditingEmployee(null);
        }}
        employee={editingEmployee}
        departments={departments}
        grades={gradesQuery.data?.data ?? []}
        templates={templatesQuery.data?.data ?? []}
        supervisors={employees}
        positionOptions={positionOptions}
        onSaved={async (values, isEdit) => {
          if (isEdit && editingEmployee) {
            await updateMutation.mutateAsync({ id: editingEmployee.id, values });
          } else {
            await createMutation.mutateAsync(values);
          }
        }}
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

export default function HumanResourcesPage() {
  return (
    <React.Suspense
      fallback={
        <PeopleShell activeTab="employees">
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-ink-muted)" }}>
            Loading employee directory...
          </div>
        </PeopleShell>
      }
    >
      <HumanResourcesContent />
    </React.Suspense>
  );
}
