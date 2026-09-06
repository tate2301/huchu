"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { Plus } from "@corelithzw/ui/lib/icons";
import { fetchJson } from "@/lib/api-client";
import { fetchDepartments, type EmployeeSummary } from "@/lib/api";
import type { EmployeePositionValue } from "@/lib/platform/vertical-defaults";

import { SchoolStaffSheet } from "./school-staff-sheet";

/**
 * The people a school employs who do not teach.
 *
 * The bursar, the secretary, the nurse, the groundsman, the cooks, the drivers,
 * the security. A school runs on them and the campus module could not name one
 * of them: `/schools/teachers` is a *teaching* register — it carries subjects,
 * classes and a form group, none of which a matron has — so a cook entered
 * there would be a teacher who teaches nothing.
 *
 * They are HR employees, not a second staff table. That is the whole design:
 * one payroll, one leave ledger, one disciplinary record for everybody the
 * company employs, and a school view over the slice of it assigned to
 * `SCHOOLS`. A tenant running a mine and a school pays both from the same book.
 * What this screen adds is the school's way in — filtered to its own people,
 * with the office's vocabulary rather than the mine's.
 *
 * Teachers are deliberately absent. A teacher already has a record here as an
 * employee (that is what `TeacherEmployeePanel` joins up) and a profile in the
 * teaching register; listing them in both would leave two screens each showing
 * half a person, and neither saying which half.
 */

/**
 * The posts a school's non-teaching staff hold.
 *
 * Drawn from `EMPLOYEE_POSITION_VALUES` — these are the company's positions,
 * not a school vocabulary of their own, because the record is an ordinary
 * employee and inventing "GROUNDSMAN" here would be a value payroll has never
 * heard of. TEACHER is the one deliberately absent: a teacher's record lives in
 * the teaching register next door.
 */
const NON_TEACHING_POSITIONS = [
  { value: "ACCOUNTANT", label: "Bursary" },
  { value: "ADMINISTRATOR", label: "Administration" },
  { value: "CLERK", label: "Office and admin" },
  { value: "DRIVER", label: "Drivers" },
  { value: "MANAGER", label: "Management" },
  { value: "SUPERVISOR", label: "Supervisors" },
  { value: "SUPPORT_STAFF", label: "Grounds and domestic" },
  { value: "TECHNICIAN", label: "Maintenance" },
] as const satisfies ReadonlyArray<{ value: EmployeePositionValue; label: string }>;

type StaffTab = "all" | "active" | "inactive";

const TABS: Array<{ id: StaffTab; label: string }> = [
  { id: "active", label: "On the staff" },
  { id: "inactive", label: "Left" },
  { id: "all", label: "Everyone" },
];

export function SchoolStaffContent() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<StaffTab>("active");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [editing, setEditing] = useState<EmployeeSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["schools", "staff", { tab, search, position, departmentId }],
    queryFn: () => {
      // The school's own door onto these records. `/api/employees` is gated on
      // `hr.employees` — a feature the Schools Suite does not carry — and its
      // permission matrix has no row for SCHOOL_ADMIN or REGISTRAR, so the
      // office staff this page was built for were reading a 403. The v2 route
      // asks for the same employees under `schools.teachers`, and excludes
      // teachers server-side.
      const params = new URLSearchParams({ limit: "200" });
      if (tab !== "all") params.set("active", String(tab === "active"));
      if (search) params.set("search", search);
      if (departmentId) params.set("departmentId", departmentId);
      if (position) params.set("position", position);
      return fetchJson<{ data: EmployeeSummary[] }>(
        `/api/v2/schools/staff?${params.toString()}`,
      );
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["schools", "staff", "departments"],
    queryFn: () => fetchDepartments({ active: true, limit: 100 }),
    staleTime: 5 * 60_000,
  });

  /**
   * Ending somebody's employment, not deleting them.
   *
   * A leaver's record is the thing their final payslip, their leave balance and
   * any incident on file all hang off. Removing the row would take those with
   * it, so the verb sets `isActive` false and the "Left" tab is where they go.
   */
  const endEmploymentMutation = useMutation({
    mutationFn: (employee: EmployeeSummary) =>
      fetchJson(`/api/v2/schools/staff/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "staff"] });
    },
  });

  const staff = useMemo(() => staffQuery.data?.data ?? [], [staffQuery.data]);
  const departments = useMemo(
    () => departmentsQuery.data?.data ?? [],
    [departmentsQuery.data],
  );

  const counts = useMemo(() => {
    const active = staff.filter((employee) => employee.isActive).length;
    const withoutAccount = staff.filter((employee) => !employee.user).length;
    return { total: staff.length, active, withoutAccount };
  }, [staff]);

  const columns = useMemo<ColumnDef<EmployeeSummary>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Staff member",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar name={row.original.name} />
            <div className="min-w-0">
              <Link
                href={`/people/${row.original.id}`}
                className="block truncate font-medium hover:underline"
              >
                {row.original.name}
              </Link>
              <span className="block truncate text-sm text-muted-foreground">
                {row.original.jobTitle ?? positionLabel(row.original.position)}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "employeeId",
        header: "Staff number",
        cell: ({ row }) => (
          <span className="font-[family-name:var(--font-mono)] text-sm tabular-nums">
            {row.original.employeeId}
          </span>
        ),
      },
      {
        accessorKey: "department",
        header: "Department",
        cell: ({ row }) => row.original.department?.name ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="font-[family-name:var(--font-mono)] text-sm">
            {row.original.phone}
          </span>
        ),
      },
      {
        id: "account",
        header: "Account",
        cell: ({ row }) =>
          row.original.user ? (
            <Badge tone="success">{row.original.user.email}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">No sign-in</span>
          ),
      },
      {
        id: "payroll",
        header: "Payroll record",
        cell: ({ row }) => (
          <Link
            href={`/payroll?employee=${row.original.id}`}
            className="text-sm hover:underline"
          >
            Open in payroll
          </Link>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.teachers"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditing(row.original);
                  setSheetOpen(true);
                },
              },
              ...(row.original.isActive
                ? [
                    {
                      label: "End employment",
                      action: "archive" as const,
                      tone: "danger" as const,
                      loading:
                        endEmploymentMutation.isPending &&
                        endEmploymentMutation.variables?.id === row.original.id,
                      onSelect: () => endEmploymentMutation.mutate(row.original),
                      confirm: {
                        title: `End ${row.original.name}’s employment?`,
                        // The confirm says what survives. "Are you sure?" is not
                        // a question anybody can answer; the fear that stops a
                        // secretary here is that this erases the person.
                        description:
                          "They move to the “Left” tab. Their payslips, leave balance and anything on file stay where they are — this ends the employment, it does not delete the person.",
                        confirmLabel: "End employment",
                      },
                    },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
    [endEmploymentMutation],
  );

  return (
    <>
      <PageChrome title="Support staff">
        <Button
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a staff member
        </Button>
      </PageChrome>

      <PageBand
        chips={[
          { label: "On the staff", value: counts.active },
          { label: "No sign-in", value: counts.withoutAccount, tone: "warn" },
        ]}
      />

      <TableControls
        tabs={
          <div className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-1">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={
                  entry.id === tab
                    ? "rounded-[var(--radius-sm)] bg-[color:var(--surface)] px-3 py-1 text-sm font-semibold shadow-[var(--shadow-xs)]"
                    : "rounded-[var(--radius-sm)] px-3 py-1 text-sm text-muted-foreground"
                }
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or staff number"
          />
        }
        filters={
          <>
            <FilterSelect
              label="Role"
              value={position}
              onChange={setPosition}
              allLabel="Every role"
              options={NON_TEACHING_POSITIONS.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
            />
            <FilterSelect
              label="Department"
              value={departmentId}
              onChange={setDepartmentId}
              allLabel="Every department"
              options={departments.map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />
          </>
        }
      />

      {staffQuery.isPending ? (
        <TableRowsSkeleton
          headers={[
            "Staff member",
            "Staff number",
            "Department",
            "Phone",
            "Account",
            "Payroll record",
          ]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 90 },
            { width: 120 },
            { width: 110 },
            { width: 140, badge: true },
            { width: 100, badge: true },
          ]}
        />
      ) : staffQuery.isError ? (
        <LoadError what="the staff list" error={staffQuery.error} />
      ) : staff.length === 0 ? (
        search || position || departmentId ? (
          <NothingMatched
            what="staff"
            filters={[
              ...(search ? [`“${search}”`] : []),
              ...(position ? [positionLabel(position)] : []),
              ...(departmentId
                ? [departments.find((entry) => entry.id === departmentId)?.name ?? "a department"]
                : []),
            ]}
            onClear={() => {
              setSearch("");
              setPosition("");
              setDepartmentId("");
            }}
          />
        ) : (
          <NothingYet
            title="No support staff yet"
            body="The bursar, the secretary, the nurse, the grounds team — everybody a school employs who does not teach."
          />
        )
      ) : (
        <DataTable columns={columns} data={staff} />
      )}

      {endEmploymentMutation.isError ? (
        <SaveError what="The employment" error={endEmploymentMutation.error} />
      ) : null}

      <SchoolStaffSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        employee={editing}
        departments={departments}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["schools", "staff"] });
          setSheetOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function positionLabel(position: string) {
  return (
    NON_TEACHING_POSITIONS.find((entry) => entry.value === position)?.label ??
    position
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^./, (character) => character.toUpperCase())
  );
}
